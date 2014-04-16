define([
    'esri/map',
    'esri/dijit/Geocoder',
    'esri/layers/FeatureLayer',
    'esri/layers/osm',
    'dojo/dom',
    'dojo/dom-construct',
    'dojo/dom-style',
    'dojo/dom-class',
    'dojo/on',
    'dojo/parser',
    'dojo/_base/array',
    'dijit/layout/BorderContainer',
    'dijit/layout/ContentPane',
    'dijit/TitlePane',
    'dojo/_base/window',
    'dojo/_base/lang',
    'gis/dijit/Growler',
    'gis/dijit/GeoLocation',
    'gis/dijit/Help',
    'gis/dijit/Basemaps',
    'dojo/text!./templates/mapOverlay.html',
    'viewer/config',
    'esri/IdentityManager',
    'esri/tasks/GeometryService',
    'gis/dijit/Identify',
    'dojo/aspect'
], function(Map, Geocoder, FeatureLayer, osm, dom, domConstruct, Style, domClass, on, parser, array, BorderContainer, ContentPane, TitlePane, win, lang, Growler, GeoLocation, Help, Basemaps, mapOverlay, config, IdentityManager, GeometryService, Identify, aspect) {

    var widgetInitializers = {
        scalebar: function (widgetConfig) {
            require(['esri/dijit/Scalebar'], lang.hitch(this, function (Scalebar) {
                this.scalebar = new Scalebar({
                    map: this.map,
                    attachTo: config.widgets.scalebar.options.attachTo,
                    scalebarStyle: config.widgets.scalebar.options.scalebarStyle,
                    scalebarUnit: config.widgets.scalebar.options.scalebarUnit
                });
            }));
        },
        legend: function (widgetConfig, position) {
            var legendTP = this._createTitlePane(widgetConfig.title, position, widgetConfig.open);
            require(['esri/dijit/Legend'], lang.hitch(this, function (Legend) {
                this.legend = new Legend({
                    map: this.map,
                    layerInfos: this.legendLayerInfos
                }, domConstruct.create("div")).placeAt(legendTP.containerNode);
            }));
        },
        TOC: function (widgetConfig, position) {
            var TOCTP = this._createTitlePane(widgetConfig.title, position, widgetConfig.open);
            require(['gis/dijit/TOC'], lang.hitch(this, function (TOC) {
                this.toc = new TOC({
                    map: this.map,
                    layerInfos: this.legendLayerInfos
                }, domConstruct.create("div")).placeAt(TOCTP.containerNode);
                this.toc.startup();
            }));
        },
        bookmarks: function (widgetConfig, position) {
            var bookmarksTP = this._createTitlePane(widgetConfig.title, position, widgetConfig.open);
            require(['gis/dijit/Bookmarks'], lang.hitch(this, function (Bookmarks) {
                this.bookmarks = new Bookmarks({
                    map: this.map,
                    editable: true
                }, domConstruct.create("div")).placeAt(bookmarksTP.containerNode);
                this.bookmarks.startup();
            }));
        },
        draw: function (widgetConfig, position) {
            var drawTP = this._createTitlePane(widgetConfig.title, position, widgetConfig.open);
            require(['gis/dijit/Draw'], lang.hitch(this, function (Draw) {
                this.drawWidget = new Draw({
                    map: this.map
                }, domConstruct.create("div")).placeAt(drawTP.containerNode);
                this.drawWidget.startup();
            }));
        },
        measure: function (widgetConfig, position) {
            var measureTP = this._createTitlePane(widgetConfig.title, position, widgetConfig.open);
            require(['esri/dijit/Measurement'], lang.hitch(this, function (Measurement) {
                this.measure = new Measurement({
                    map: this.map,
                    defaultAreaUnit: widgetConfig.defaultAreaUnit,
                    defaultLengthUnit: widgetConfig.defaultLengthUnit
                }, domConstruct.create("div")).placeAt(measureTP.containerNode);
                this.measure.startup();
            }));
        },
        directions: function (widgetConfig, position) {
            var directionsTP = this._createTitlePane(widgetConfig.title, position, widgetConfig.open);
            require(['gis/dijit/Directions'], lang.hitch(this, function (Directions) {
                this.directionsWidget = new Directions({
                    map: this.map,
                    options: widgetConfig.options,
                    titlePane: directionsTP
                }, domConstruct.create("div")).placeAt(directionsTP.containerNode);
                this.directionsWidget.startup();
            }));
        },
        print: function (widgetConfig, position) {
            var printTP = this._createTitlePane(widgetConfig.title, position, widgetConfig.open);
            require(['gis/dijit/Print'], lang.hitch(this, function (Print) {
                this.printWidget = new Print({
                    map: this.map,
                    printTaskURL: widgetConfig.serviceURL,
                    authorText: widgetConfig.authorText,
                    copyrightText: widgetConfig.copyrightText,
                    defaultTitle: widgetConfig.defaultTitle,
                    defaultFormat: widgetConfig.defaultFormat,
                    defaultLayout: widgetConfig.defaultLayout
                }, domConstruct.create("div")).placeAt(printTP.containerNode);
                this.printWidget.startup();
            }));
        },
        editor: function (widgetConfig, position) {
            var editorTP = this._createTitlePane(widgetConfig.title, position, widgetConfig.open);
            require(['gis/dijit/Editor'], lang.hitch(this, function (Editor) {
                this.editor = new Editor({
                    map: this.map,
                    layerInfos: this.editorLayerInfos,
                    settings: widgetConfig.settings,
                    titlePane: editorTP
                }, domConstruct.create("div")).placeAt(editorTP.containerNode);
                this.editor.startup();
            }));
        }        
    };

    return {
        config: config,
        legendLayerInfos: [],
        editorLayerInfos: [],
        tocLayerInfos: [],
        mapClickMode: {
            current: config.defaultMapClickMode,
            default: config.defaultMapClickMode
        },
        startup: function() {
            this.initConfig();
            this.initView();
            app = this; //dev only
        },
        initConfig: function() {
            esri.config.defaults.io.proxyUrl = config.proxy.url;
            esri.config.defaults.io.alwaysUseProxy = config.proxy.alwaysUseProxy;
            esri.config.defaults.geometryService = new GeometryService(config.geometryService.url);
        },
        initView: function() {
            this.outer = new BorderContainer({
                id: 'borderContainer',
                design: 'headline',
                gutters: false
            }).placeAt(win.body());

            this.sidebar = new ContentPane({
                id: 'sidebar',
                region: 'left'
            }).placeAt(this.outer);

            new ContentPane({
                region: 'center',
                id: 'map',
                content: mapOverlay
            }).placeAt(this.outer);

            this.outer.startup();
            this.initMap();

            on(dom.byId('helpA'), 'click', lang.hitch(this, 'showHelp'));
            this.sideBarToggle = dom.byId('sidebarCollapseButton');
            on(this.sideBarToggle, 'click', lang.hitch(this, 'toggleSidebar'));
            Style.set(this.sideBarToggle, 'display', 'block');
        },
        initMap: function() {
            this.map = new esri.Map("map", {
                extent: new esri.geometry.Extent(config.initialExtent)
            });

            this.map.on('load', lang.hitch(this, 'initLayers'));
            this.map.on('layers-add-result', lang.hitch(this, 'initWidgets'));

            this.basemaps = new Basemaps({
                map: this.map,
                mode: config.basemapMode,
                title: "Basemaps",
                mapStartBasemap: config.mapStartBasemap,
                basemapsToShow: config.basemapsToShow
            }, "basemapsDijit");
            this.basemaps.startup();
        },
        initLayers: function(evt) {
            this.layers = [];
            array.forEach(config.operationalLayers, function(layer) {
                var l;
                if (layer.type == 'dynamic') {
                    l = new esri.layers.ArcGISDynamicMapServiceLayer(layer.url, layer.options);
                } else if (layer.type == 'tiled') {
                    l = new esri.layers.ArcGISTiledMapServiceLayer(layer.url, layer.options);
                } else if (layer.type == 'feature') {
                    l = new esri.layers.FeatureLayer(layer.url, layer.options);
                    var options = {
                        featureLayer: l
                    };
                    if (layer.editorLayerInfos) {
                        lang.mixin(options, layer.editorLayerInfos);
                    }
                    this.editorLayerInfos.push(options);
                } else {
                    console.log('Layer type not supported: ', layer.type);
                }
                this.layers.unshift(l); // unshift instead to keep layer ordering on map intact
                this.legendLayerInfos.unshift({
                    layer: l,
                    title: layer.title || null
                });
                this.tocLayerInfos.push({ //push because Legend and TOC need the layers in the opposite order
                    layer: l,
                    title: layer.title || null,
                    slider: layer.slider || true,
                    noLegend: layer.noLegend || false,
                    collapsed: layer.collapsed || false
                });
            }, this);
            this.map.addLayers(this.layers);

            this.growler = new Growler({}, "growlerDijit");
            this.growler.startup();

            this.geoLocation = new GeoLocation({
                map: this.map,
                growler: this.growler
            }, "geoLocationDijit");
            this.geoLocation.startup();

            this.geocoder = new esri.dijit.Geocoder({
                map: this.map,
                autoComplete: true
            }, "geocodeDijit");
            this.geocoder.startup();

        },
        initWidgets: function(evt) {

            this.identify = new Identify({
                identifyTolerance: config.identifyTolerance,
                map: this.map,
                mapClickMode: this.mapClickMode
            });

            var widgets = [];
            for (var key in config.widgets) {
                var widget = lang.clone(config.widgets[key]);
                if (widget.include) {
                    widget.position = 'undefined' !== typeof widget.position ? widget.position : 10000;

                    widgets.push({ 'key': key, 'config': widget });
                }
            }
            widgets.sort(function (a, b) { return a.config.position - b.config.position; });

            array.forEach(widgets, function (widget, i) {
                lang.hitch(this, widgetInitializers[widget.key], widget.config, i)();
            }, this);
        },
        setMapClickMode: function(mode) {
            this.mapClickMode.current = mode;
        },
        toggleSidebar: function() {
            var domStore = dom.byId('sidebarStorage');
            if (this.outer.getIndexOfChild(this.sidebar) !== -1) {
                this.outer.removeChild(this.sidebar);
                domStore.appendChild(this.sidebar.domNode);
                domClass.remove(this.sideBarToggle, 'close');
                domClass.add(this.sideBarToggle, 'open');
            } else {
                domStore.removeChild(this.sidebar.domNode);
                this.outer.addChild(this.sidebar);
                domClass.remove(this.sideBarToggle, 'open');
                domClass.add(this.sideBarToggle, 'close');
            }
        },
        _createTitlePane: function(title, position, open) {
            var tp = new TitlePane({
                title: title,
                open: open
            }).placeAt(this.sidebar, position);
            tp.startup();
            return tp;
        },
        showHelp: function() {
            if (this.help) {
                this.help.show();
            } else {
                this.help = new Help();
                this.help.show();
            }
        }
    };
});