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

function translate2d(element, transformation, keep) {
    if (!element.style) return

    let style = 'translate('+ (transformation.x || 0) +'px,'+ (transformation.y) || 0 +'px) rotate(.0001deg)'
    element.style[prefix+'transform'] = style
    element.style.transform = style
}

function translate3d(element, transformation, keep) {
    if (!element.style) return

    let style = 'translate3d('+ (transformation.x || 0) +'px,'+ (transformation.y || 0) +'px,'+ (transformation.z || 0) +'px) rotate(.0001deg)'
    element.style[prefix+'transform'] = style
    element.style.transform = style
}

const prefix = '-'+(Array.prototype.slice
  .call(window.getComputedStyle(document.documentElement, ''))
  .join('')
  .match(/-(moz|webkit|ms)-/) || (styles.OLink === '' && ['', 'o'])
)[1]+'-'
document.documentElement.style[prefix+'transform'] = 'translate3d(0, 0, 0)'
const use2d = !document.documentElement.style[prefix+'transform']
document.documentElement.style[prefix+'transform'] = ''

const translate = use2d ? translate2d : translate3d

export class SmoothScroller {
    constructor(config) {
        if (typeof config == 'string') config = {element: config}

        this.config = defaultify(config, defaults)

        this.updateCallbacks = []
        this.scrollCallbacks = []
        this.resizeCallbacks = []

        this.element = getElement(this.config.element)
        this.parent = parent(this.element)

        this.localCallback = this.scrolling.bind(this)
        this.scrollEvents = new ScrollEvents({element:this.parent,stopPropa:true})
        this.scrollEvents.on(this.localCallback)

        this.ease = this.config.ease
        this.autoEase = this.config.autoEase
        this.scrollEnabled = true

        addClass(this.parent, 'smooth-scroll-container')
        style(this.parent, {
            position: 'relative'
        })

        this.scroll = { x: 0, y: 0 }
        this.target = { x: 0, y: 0 }

        if (this.config.scrollbar) {
            if (this.sizeblock = this.config.scrollbar == 'natives') {
                style(this.element, {
                    position: 'fixed',
                    top: 0,
                    left: 0
                })

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
                style(this.element, {
                    position: 'absolute',
                    top: 0,
                    left: 0
                })

                style(this.parent, {'overflow':'hidden'})

                this.scrollbar = {}

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
        else {
            style(this.element, {
                position: 'absolute',
                top: 0,
                left: 0
            })

            style(this.parent, {'overflow':'hidden'})
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
        let shouldUpdate

        if (shouldUpdate = !this.updating && (Math.abs(this.delta.y) > 0.1 || Math.abs(this.delta.x) > 0.1))
            this.update()

        return shouldUpdate
    }

    update() {
        let dx = this.target.x - this.scroll.x,
        dy = this.target.y - this.scroll.y,
        ease = this.autoScroll ? this.config.autoEase : this.config.ease

        if (!(this.updating = Math.abs(dy) > 0.1 || Math.abs(dx) > 0.1)) {
            this.stopAutoScroll()

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

            parallax.center.top -= this.delta.y
            parallax.center.left -= this.delta.x

            let deltaX = this.xRatio != -1 ? (parallax.center.left - this.viewport.hWidth) * parallax.ratio : 0,
                deltaY = this.yRatio != -1 ? (parallax.center.top - this.viewport.hHeight) * parallax.ratio : 0

            // if (parallax.position.top >= parallax.size.height - deltaY &&
            //     parallax.position.top <= this.viewport.height - deltaY &&
            //     parallax.position.left >= parallax.size.width - deltaX &&
            //     parallax.position.left <= parallax.size.width - deltaX)
            translate(parallax.element, {
                x: deltaX,
                y: deltaY
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

    scrollTo(target, callback) {
        this.scrollToCallback = callback || (()=>{})

        this.setNewTarget(target)

        if(!(this.updateIfNeeded())) {
            this.scrollEnabled = false
            this.autoScroll = true

            this.scrollToCallback()
        }
    }

    setNewTarget(target) {
        if (!this.scrollableSize) this.resize()

        if ('x' in target) {
            target.x = range(target.x, 0, this.scrollableSize.width)
        }
        else if ('ratioX' in target) {
            target.x = target.ratioX * this.scrollableSize.width
        }
        else {
            target.x = this.target.x
        }

        if ('y' in target) {
            target.y = range(target.y, 0, this.scrollableSize.height)
        }
        else if ('ratioY' in target) {
            target.y = target.ratioY * this.scrollableSize.height
        }
        else {
            target.y = this.target.y
        }

        this.target = target

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

            if (ratio == 1 || ratio == 0) {
                removeClass(this.parent, 'vertical-scroll')
                hide(this.scrollbar.vertical.bar)
            }
            else {
                addClass(this.parent, 'vertical-scroll')
                show(this.scrollbar.vertical.bar)
            }
        }

        if (this.scrollbar.horizontal) {
            let ratio = range(this.parentSize.width / this.elementSize.width)
            this.scrollbar.horizontal.barSize = width(this.scrollbar.horizontal.bar)
            this.scrollbar.horizontal.cursorSize = ratio * this.scrollbar.horizontal.barSize
            width(this.scrollbar.horizontal.cursor, ratio*100+'%')

            if (ratio == 1 || ratio == 0) {
                removeClass(this.parent, 'horizontal-scroll')
                hide(this.scrollbar.horizontal.bar)
            }
            else {
                addClass(this.parent, 'horizontal-scroll')
                show(this.scrollbar.horizontal.bar)
            }
        }
    }

    resize() {
        this.viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        }

        this.viewport.hWidth = this.viewport.width / 2
        this.viewport.hHeight = this.viewport.height / 2

        if (this.fakeScroll) size(this.fakeScroll, {width:0,height:0})
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
        else if (this.yRatio = -1) {
            this.target.y = this.scroll.y = 0
        }

        if(this.elementSize.width - this.scroll.x < this.parentSize.width) {
            this.xRatio = 1.0
            this.target.x = this.scroll.x = this.xRatio * this.scrollableSize.width
        }
        else if (this.xRatio = -1) {
            this.target.x = this.scroll.x = 0
        }

        if (this.fakeScroll) size(this.fakeScroll, this.elementSize)

        forEach(this._parallax, (parallax) => {
            let eSize = size(parallax.container),
                screenPos = screenPosition(parallax.container)

            parallax.size = eSize
            parallax.position = screenPos
            parallax.center = {
                left: screenPos.left + eSize.width/2,
                top: screenPos.top + eSize.height/2
            }
        })

        this.refreshScrollbars()

        this.applyScroll()

        this.triggerCallbacks('resize')
    }

    fixElements(elements) {
        forElements(elements, (element) => {
            let index = this.indexOf(this._fixed, element)

            if (index == -1) {
                let elOffset = offset(element)

                this._fixed.push({
                    update: true,
                    element: element,
                    initial: {
                        x: this.scroll.x,
                        y: this.scroll.y
                    }
                })
            }
            else {
                this._fixed[index].update = true
            }
        })
    }

    indexOf(list, item) {
        let i = list.length
        while(i-- && list[i].element != item) {}

        return i
    }

    unfixElements(elements, keepTransform = false) {
        forElements(elements, (element) => {
            let i = this._fixed.length, done = false

            let index = this.indexOf(this._fixed, element)

            if (index == -1) return

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

    parallaxElements(elements, options) {
        let ratio = (typeof options == 'object') ? options.ratio : options,
            container = !!options.group ? closest(elements, '.'+options.group) : null,
            eSize, screenPos

        if (options.group) {
            eSize = size(container)
            screenPos = screenPosition(container)
        }

        forElements(elements, (element) => {
            if (!container) {
                eSize = size(element)
                screenPos = screenPosition(element)
            }

            this._parallax.push({
                container: container || element,
                element: element,
                ratio: ratio,
                size: eSize,
                position: screenPos,
                center: {
                    left: screenPos.left + eSize.width/2,
                    top: screenPos.top + eSize.height/2
                }
            })
        })
    }

    unparallaxElements(elements, options) {
        forElements(elements, (element) => {
            let i = this._parallax.length, done = false

            let index = this.indexOf(this._parallax, element)

            if (index == -1) return

            this._parallax.splice(index, 1)

            style(element, {
                transform: ''
            })
        })
    }

    stopAutoScroll() {
        if (!this.autoScroll) return

        this.scrollEnabled = true
        this.autoScroll = false

        this.scrollToCallback()
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
            left: '',
            transform: ''
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
