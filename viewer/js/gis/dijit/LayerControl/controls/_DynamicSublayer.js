define([
    'dojo/_base/declare',
    'dojo/_base/lang',
    'dojo/_base/array',
    'dojo/on',
    'dojo/dom-class',
    'dojo/dom-style',
    'dojo/dom-attr',
    'dojo/fx',
    'dojo/html',
    'dijit/Menu',
    'dijit/MenuItem',
    'dojo/topic',
    'dijit/_WidgetBase',
    'dijit/_TemplatedMixin',
    'dojo/text!./templates/Sublayer.html',
    'dojo/i18n!./../nls/resource'
], function (
        declare,
        lang,
        array,
        on,
        domClass,
        domStyle,
        domAttr,
        fx,
        html,
        Menu,
        MenuItem,
        topic,
        WidgetBase,
        TemplatedMixin,
        sublayerTemplate,
        i18n
        ) {
    var _DynamicSublayer = declare([WidgetBase, TemplatedMixin], {
        control: null,
        sublayerInfo: null,
        icons: null,
        // ^args
        templateString: sublayerTemplate,
        i18n: i18n,
        _expandClickHandler: null,
        postCreate: function () {
            this.inherited(arguments);
            var checkNode = this.checkNode;
            domAttr.set(checkNode, 'data-sublayer-id', this.sublayerInfo.id);
            domClass.add(checkNode, this.control.layer.id + '-layerControlSublayerCheck');
            if (array.indexOf(this.control.layer.visibleLayers, this.sublayerInfo.id) !== -1) {
                this._setSublayerCheckbox(true, checkNode);
            } else {

                this._setSublayerCheckbox(false, checkNode);
            }
            on(checkNode, 'click', lang.hitch(this, function () {
                if (domAttr.get(checkNode, 'data-checked') === 'checked') {
                    this._setSublayerCheckbox(false, checkNode);
                } else {
                    this._setSublayerCheckbox(true, checkNode);
                }
                this.control._setVisibleLayers();
                this._checkboxScaleRange();
            }));
            html.set(this.labelNode, this.sublayerInfo.name);
            this._expandClick();
            if (this.sublayerInfo.minScale !== 0 || this.sublayerInfo.maxScale !== 0) {
                this._checkboxScaleRange();
                this.control.layer.getMap().on('zoom-end', lang.hitch(this, '_checkboxScaleRange'));
            }
            //set up menu
            if (this.control.controlOptions.menu && 
                    this.control.controlOptions.menu.length) {
                domClass.add(this.labelNode, 'menuLink');
                this.menu = new Menu({
                    contextMenuForWindow: false,
                    targetNodeIds: [this.labelNode],
                    leftClickToOpen: true
                });
                array.forEach(this.control.controlOptions.menu, lang.hitch(this, '_addMenuItem'));
                this.menu.startup();
            }
        },
        _addMenuItem: function (menuItem) {
            this.menu.addChild(new MenuItem(lang.mixin(menuItem, {
                onClick: lang.hitch(this, function () {
                    topic.publish('LayerControl/' + menuItem.topic, {
                        layer: this.control.layer,
                        subLayer: this.sublayerInfo
                    });
                })
            })));
        },
        // add on event to expandClickNode
        _expandClick: function () {
            var i = this.icons;
            this._expandClickHandler = on(this.expandClickNode, 'click', lang.hitch(this, function () {
                var expandNode = this.expandNode,
                        iconNode = this.expandIconNode;
                if (domStyle.get(expandNode, 'display') === 'none') {
                    fx.wipeIn({
                        node: expandNode,
                        duration: 300
                    }).play();
                    domClass.replace(iconNode, i.collapse, i.expand);
                } else {
                    fx.wipeOut({
                        node: expandNode,
                        duration: 300
                    }).play();
                    domClass.replace(iconNode, i.expand, i.collapse);
                }
            }));
        },
        // set checkbox based on layer so it's always in sync
        _setSublayerCheckbox: function (checked, checkNode) {
            checkNode = checkNode || this.checkNode;
            var i = this.icons;
            if (checked) {
                domAttr.set(checkNode, 'data-checked', 'checked');
                domClass.replace(checkNode, i.checked, i.unchecked);
            } else {
                domAttr.set(checkNode, 'data-checked', 'unchecked');
                domClass.replace(checkNode, i.unchecked, i.checked);
            }
        },
        // check scales and add/remove disabled classes from checkbox
        _checkboxScaleRange: function () {
            var node = this.checkNode,
                    scale = this.control.layer.getMap().getScale(),
                    min = this.sublayerInfo.minScale,
                    max = this.sublayerInfo.maxScale;
            domClass.remove(node, 'layerControlCheckIconOutScale');
            if ((min !== 0 && scale > min) || (max !== 0 && scale < max)) {
                domClass.add(node, 'layerControlCheckIconOutScale');
            }
        }
    });
    return _DynamicSublayer;
});