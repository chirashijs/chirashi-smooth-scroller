import raf from 'raf'

import forEach from 'chirashi/src/core/for-each'
import forElements from 'chirashi/src/core/for-elements'
import getElement from 'chirashi/src/core/get-element'
import getElements from 'chirashi/src/core/get-elements'

import closest from 'chirashi/src/dom/closest'
import append from 'chirashi/src/dom/append'
import remove from 'chirashi/src/dom/remove'
import addClass from 'chirashi/src/dom/add-class'
import removeClass from 'chirashi/src/dom/remove-class'
import parent from 'chirashi/src/dom/parent'
import find from 'chirashi/src/dom/find'

import style from 'chirashi/src/styles/style'
import height from 'chirashi/src/styles/height'
import width from 'chirashi/src/styles/width'
import size from 'chirashi/src/styles/size'
import translate from 'chirashi/src/styles/translate'
import offset from 'chirashi/src/styles/offset'
import screenPosition from 'chirashi/src/styles/screen-position'
import hide from 'chirashi/src/styles/hide'
import show from 'chirashi/src/styles/show'

import drag from 'chirashi/src/events/drag'
import undrag from 'chirashi/src/events/undrag'
import resize from 'chirashi/src/events/resize'
import unresize from 'chirashi/src/events/unresize'

import defaultify from 'chirashi/src/utils/defaultify'
import range from 'chirashi/src/utils/range'

import ScrollEvents from 'chirashi-scroll-events'

let defaults = {
    direction: 'auto',
    ease: 0.2,
    autoEase: 0.08,
    fixed: []
}

export class SmoothScroller {
    constructor(config) {
        if (typeof config == 'string') config = {element: config}

        this.config = defaultify(config, defaults)

        this.updateCallbacks = []
        this.scrollCallbacks = []
        this.resizeCallbacks = []

        this.localCallback = this.scrolling.bind(this)
        this.scrollEvents = new ScrollEvents()
        this.scrollEvents.on(this.localCallback)

        this.element = getElement(this.config.element)

        this.ease = this.config.ease
        this.autoEase = this.config.autoEase
        this.scrollEnabled = true

        this.parent = parent(this.element)
        addClass(this.parent, 'smooth-scroll-container')
        style(this.parent, {
            position: 'relative'
        })

        style(this.element, {
            position: 'fixed',
            top: 0,
            left: 0
        })

        this.scroll = { x: 0, y: 0 }
        this.target = { x: 0, y: 0 }

        if (this.config.scrollbar) {
            if (this.sizeblock = this.config.scrollbar == 'natives') {
                this.fakeScroll = append(this.parent, '<div class="fake-scroll"></div>')

                if (this.config.direction == 'auto') {
                    style(this.parent, {'overflow':'scroll'})
                }
                else if (this.config.direction == 'vertical') {
                    style(this.parent, {'overflow-x':'hidden'})
                    style(this.parent, {'overflow-y':'scroll'})
                }
                else {
                    style(this.parent, {'overflow-x':'scroll'})
                    style(this.parent, {'overflow-y':'hidden'})
                }
            }
            else {
                this.scrollbar = {}

                style(this.parent, {'overflow':'hidden'})

                if (this.config.direction == 'auto' || this.config.direction == 'vertical'){
                    let scrollbarElement = append(this.parent, '<div class="scrollbar vertical"></div>'),
                    cursorElement = append(scrollbarElement, '<div class="cursor"></div>')

                    this.scrollbar.vertical = {
                        bar: scrollbarElement,
                        cursor: cursorElement
                    }

                    let handleScrollCursor = (position) => {
                        let ratio = range((position.y - screenPosition(scrollbarElement).top - this.scrollbar.vertical.cursorSize/2) / (this.scrollbar.vertical.barSize - this.scrollbar.vertical.cursorSize))
                        this.setNewTarget({
                            y: ratio * this.scrollableSize.height
                        })

                        this.updateIfNeeded()
                    }

                    this.dragVCallbacks = drag(scrollbarElement, handleScrollCursor, handleScrollCursor)
                }

                if (this.config.direction == 'auto' || this.config.direction == 'horizontal') {
                    let scrollbarElement = append(this.parent, '<div class="scrollbar horizontal"></div>'),
                    cursorElement = append(scrollbarElement, '<div class="cursor"></div>')

                    this.scrollbar.horizontal = {
                        bar: scrollbarElement,
                        cursor: cursorElement
                    }

                    let handleScrollCursor = (position) => {
                        let ratio = range((position.x - screenPosition(scrollbarElement).left - this.scrollbar.horizontal.cursorSize/2) / (this.scrollbar.horizontal.barSize - this.scrollbar.horizontal.cursorSize))
                        this.setNewTarget({
                            x: ratio * this.scrollableSize.width
                        })

                        this.updateIfNeeded()
                    }

                    this.dragHCallbacks = drag(scrollbarElement, handleScrollCursor, handleScrollCursor)
                }
            }
        }

        this._fixed = []
        this.fixElements(this.config.fixed)

        this._parallax = []
        forEach(this.config.parallax, this.parallaxElements.bind(this))

        this.resizeCallback = this.resize.bind(this)
        resize(this.resizeCallback)

        raf(this.resize.bind(this))
    }

    scrolling(event) {
        if (!('yRatio' in this)) this.computeRatio()

        if (!this.scrollEnabled) {
            event.originalEvent.preventDefault()

            return
        }

        let deltaX = 0, deltaY = 0

        if (this.config.scrollbar == 'natives') {
            this.setNewTarget({
                x: event.x,
                y: event.y
            })
        }
        else {
            if (this.config.direction == 'auto') {
                deltaX = event.deltaX
                deltaY = event.deltaY
            }
            else {
                let delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY

                if (this.config.direction == 'horizontal')
                    deltaX = delta
                else
                    deltaY = delta
            }

            this.setNewTarget({
                x: this.scroll.x - deltaX,
                y: this.scroll.y - deltaY
            })
        }

        this.triggerCallbacks('scroll')

        this.updateIfNeeded()
    }

    updateIfNeeded() {
        if (!this.updating && (Math.abs(this.delta.y) > 0.1 || Math.abs(this.delta.x) > 0.1))
            this.update()
    }

    update() {
        let dx = this.target.x - this.scroll.x,
        dy = this.target.y - this.scroll.y,
        ease = this.autoScroll ? this.config.autoEase : this.config.ease

        if (!(this.updating = Math.abs(dy) > 0.1 || Math.abs(dx) > 0.1)) {
            if (this.autoScroll) {
                this.scrollEnabled = true
                this.autoScroll = false
            }

            return
        }

        this.scroll.x += this.delta.x = dx * ease
        this.scroll.y += this.delta.y = dy * ease

        this.applyScroll()

        this.triggerCallbacks('update')

        this.updateRequest = raf(this.update.bind(this))
    }

    applyScroll() {
        translate(this.element, {
            x: -this.scroll.x,
            y: -this.scroll.y
        })

        forEach(this._fixed, (fixed) => {
            if (!fixed.update) return

            translate(fixed.element, {
                x: this.scroll.x - fixed.initial.x,
                y: this.scroll.y - fixed.initial.y
            })
        })

        this.computeRatio()

        forEach(this._parallax, (parallax) => {
            parallax.position.top -= this.delta.y
            parallax.position.left -= this.delta.x

            translate(parallax.element, {
                x: this.xRatio != -1 ? (parallax.position.left - this.viewport.hWidth) * parallax.depth : 0,
                y: this.yRatio != -1 ? (parallax.position.top - this.viewport.hHeight) * parallax.depth : 0
            })
        })

        if (this.scrollbar && this.scrollbar.horizontal) {
            translate(this.scrollbar.horizontal.cursor, {
                x: this.xRatio * (this.scrollbar.horizontal.barSize - this.scrollbar.horizontal.cursorSize)
            })
        }

        if (this.scrollbar && this.scrollbar.vertical) {
            translate(this.scrollbar.vertical.cursor, {
                y: this.yRatio * (this.scrollbar.vertical.barSize - this.scrollbar.vertical.cursorSize)
            })
        }
    }

    triggerCallbacks(type) {
        let callbacks = this[type+'Callbacks']
        let i = callbacks.length
        while(i--) callbacks[i](this.target)
    }

    on(events, callback) {
        switch (events) {
            case 'scroll':
            this.scrollCallbacks.push(callback)

            break

            case 'update':
            this.updateCallbacks.push(callback)

            break

            case 'resize':
            this.resizeCallbacks.push(callback)

            break
        }
    }

    off(events, callback) {
        switch (events) {
            case 'scroll':
            this.scrollCallbacks.splice(this.scrollCallbacks.indexOf(callback))

            break

            case 'update':
            this.updateCallbacks.splice(this.updateCallbacks.indexOf(callback))

            break

            case 'resize':
            this.resizeCallbacks.splice(this.resizeCallbacks.indexOf(callback))

            break
        }
    }

    immediateScroll(target) {
        this.setNewTarget(target)

        this.scroll = this.target

        this.applyScroll()
    }

    scrollTo(target) {
        this.scrollEnabled = false
        this.autoScroll = true
        this.setNewTarget(target)

        this.updateIfNeeded()
    }

    setNewTarget(target) {
        this.target = {
            x: 'x' in target ? Math.min(Math.max(target.x, 0), this.scrollableSize.width) : this.target.x,
            y: 'y' in target ? Math.min(Math.max(target.y, 0), this.scrollableSize.height) : this.target.y
        }

        this.delta = {
            x: -(this.target.x - this.scroll.x),
            y: -(this.target.y - this.scroll.y)
        }
    }

    computeRatio() {
        this.xRatio = this.scrollableSize.width ? this.scroll.x / this.scrollableSize.width : -1
        this.yRatio = this.scrollableSize.height ? this.scroll.y / this.scrollableSize.height : -1
    }

    refreshScrollbars() {
        if (!this.scrollbar) return

        if (this.scrollbar.vertical) {
            let ratio = range(this.parentSize.height / this.elementSize.height)
            this.scrollbar.vertical.barSize = height(this.scrollbar.vertical.bar)
            this.scrollbar.vertical.cursorSize = ratio * this.scrollbar.vertical.barSize
            height(this.scrollbar.vertical.cursor, ratio*100+'%')

            if (ratio == 1 || ratio == 0) hide(this.scrollbar.vertical.bar)
            else show(this.scrollbar.vertical.bar)
        }

        if (this.scrollbar.horizontal) {
            let ratio = range(this.parentSize.width / this.elementSize.width)
            this.scrollbar.horizontal.barSize = width(this.scrollbar.horizontal.bar)
            this.scrollbar.horizontal.cursorSize = ratio * this.scrollbar.horizontal.barSize
            width(this.scrollbar.horizontal.cursor, ratio*100+'%')

            if (ratio == 1 || ratio == 0) hide(this.scrollbar.horizontal.bar)
            else show(this.scrollbar.horizontal.bar)
        }
    }

    resize() {
        this.viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        }

        this.viewport.hWidth = this.viewport.width / 2
        this.viewport.hHeight = this.viewport.height / 2

        this.elementSize = size(this.element)
        this.parentSize = size(this.parent)

        this.scrollableSize = {
            width: Math.max(this.elementSize.width - this.parentSize.width, 0),
            height: Math.max(this.elementSize.height - this.parentSize.height, 0)
        }

        this.computeRatio()

        if(this.elementSize.height - this.scroll.y < this.parentSize.height) {
            this.yRatio = 1.0
            this.target.y = this.scroll.y = this.yRatio * this.scrollableSize.height
        }

        if(this.elementSize.width - this.scroll.x < this.parentSize.width) {
            this.xRatio = 1.0
            this.target.x = this.scroll.x = this.xRatio * this.scrollableSize.width
        }

        size(this.fakeScroll, this.elementSize)

        forEach(this._parallax, (parallax) => {
            let eSize = size(parallax.element),
                screenPos = screenPosition(parallax.element)

            parallax.position = {
                left: screenPos.left + eSize.width/2,
                top: screenPos.top + eSize.height/2
            }
        })

        this.refreshScrollbars()

        this.triggerCallbacks('resize')
    }

    fixElements(elements) {
        forElements(elements, (element) => {
            let index = this._fixed.indexOf(element)

            if (index == -1) {
                let elOffset = offset(element)

                this._fixed.push({
                    update: true,
                    element: element,
                    initial: this.scroll
                })
            }
            else {
                this._fixed[index].update = true
            }
        })
    }

    unfixElements(elements, keepTransform = false) {
        forElements(elements, (element) => {
            let i = this._fixed.length, done = false

            let index = this._fixed.indexOf(element)

            if (!keepTransform) {
                this._fixed.splice(index, 1)

                style(element, {
                    position: '',
                    transform: ''
                })
            }
            else {
                this._fixed[index].update = false
            }
        })
    }

    parallaxElements(elements, depth) {
        forElements(elements, (element) => {
            let eSize = size(element),
                screenPos = screenPosition(element)
            this._parallax.push({
                element: element,
                depth: depth,
                position: {
                    left: screenPos.left + eSize.width/2,
                    top: screenPos.top + eSize.height/2
                }
            })
        })
    }

    unparallaxElements(elements, depth) {
        forElements(elements, (element) => {
            let i = this._parallax.length, done = false

            let index = this.indexOf(element)

            if (index == -1) return

            this._parallax.splice(index, 1)

            style(element, {
                transform: ''
            })
        })
    }

    enableScroll() {
        this.scrollEnabled = true
    }

    disableScroll() {
        this.scrollEnabled = false
    }

    kill() {
        this.scrollEnabled = false
        this.updating = false

        raf.cancel(this.updateRequest)
        this.scrollEvents.off(this.localCallback)

        removeClass(this.parent, 'smooth-scroll-container')
        style(this.parent, {
            overflow: '',
            position: ''
        })

        style(this.element, {
            position: '',
            top: '',
            left: ''
        })

        forEach(this._fixed, fixed => {
            style(fixed.element, {
                transform: ''
            })
        })

        remove(find(this.parent, '.scrollbar'))

        undrag(this.dragVCallbacks)
        undrag(this.dragHCallbacks)
    }
}

export default SmoothScroller
