define([
    'esri/map',
    'esri/dijit/Geocoder',
    'esri/layers/FeatureLayer',
    'esri/layers/GeoRSSLayer',
    'esri/layers/KMLLayer',
    'esri/layers/WMSLayer',
    'esri/layers/WMTSLayer',
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
    'gis/dijit/Help',
    'gis/dijit/Basemaps',
    'dojo/text!./templates/mapOverlay.html',
    'viewer/config',
    'esri/IdentityManager',
    'esri/tasks/GeometryService',
    'gis/dijit/Identify',
    'dojo/aspect'
], function(Map, Geocoder, FeatureLayer, GeoRSS, KML, WMS, WMTS, osm, dom, domConstruct, Style, domClass, on, parser, array, BorderContainer, ContentPane, TitlePane, win, lang, Growler, Help, Basemaps, mapOverlay, config, IdentityManager, GeometryService, Identify, aspect) {

    var controller = {
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
            this.domStore = dom.byId('sidebarStorage');
        },
        initMap: function() {
            var center, extent;
            if (config.center) {
                center = new esri.geometry.Point(config.center);
            } else if (config.initialExtent) {
                extent = new esri.geometry.Extent(config.initialExtent);
            }
            this.map = new esri.Map("map", {
                center: center,
                extent: extent,
                minZoom: config.minZoom,
                maxZoom: config.maxZoom,
                nav: config.nav || false,
                sliderStyle: config.sliderStyle || "small",
                zoom: config.zoom
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
                var l, options;
                if (layer.type == 'dynamic') {
                    // control which layers are visible by default (and other image parameters)
                    options = layer.options;
                    if (options.imageParameters) {
                        var im = new esri.layers.ImageParameters();
                        for (var key in options.imageParameters) {
                            im[key] = options.imageParameters[key];
                        }
                        options.imageParameters = im;
                    }
                    l = new esri.layers.ArcGISDynamicMapServiceLayer(layer.url, options);
                } else if (layer.type == 'tiled') {
                    l = new esri.layers.ArcGISTiledMapServiceLayer(layer.url, layer.options);
                } else if (layer.type == 'feature') {
                    l = new esri.layers.FeatureLayer(layer.url, layer.options);
                    options = {
                        featureLayer: l
                    };
                    if (layer.editorLayerInfos) {
                        lang.mixin(options, layer.editorLayerInfos);
                    }
                    this.editorLayerInfos.push(options);
                } else if (layer.type == 'georss') {
                    l = new esri.layers.GeoRSSLayer(layer.url, layer.options);
                } else if (layer.type == 'kml') {
                    l = new esri.layers.KMLLayer(layer.url, layer.options);
                } else if (layer.type == 'webtiled') {
                    l = new esri.layers.WebTiledLayer(layer.url, layer.options);
                } else if (layer.type == 'wms') {
                    l = new esri.layers.WMSLayer(layer.url, layer.options);
                } else if (layer.type == 'wmts') {
                    l = new esri.layers.WMTSLayer(layer.url, layer.options);
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
                mapClickMode: this.mapClickMode,
                controller: this
            });

            var widgets = [];
            array.forEach(['mapWidgets', 'sidebarWidgets'], function(widgetSet) {
                for (var key in config[widgetSet]) {
                    var widget = lang.clone(config[widgetSet][key]);
                    if (widget.include) {
                        widget.position = ('undefined' !== typeof(widget.position)) ? widget.position : 10000;
                        widgets.push({
                            key: key,
                            config: widget
                        });
                    }
                }
            });

            widgets.sort(function(a, b) {
                return a.config.position - b.config.position;
            });

            array.forEach(widgets, function(widget, i) {
                lang.hitch(this, widgetLoaders[widget.key], widget.config, i)();
            }, this);
        },
        setMapClickMode: function(mode) {
            this.mapClickMode.current = mode;
        },
        toggleSidebar: function() {
            if (this.outer.getIndexOfChild(this.sidebar) !== -1) {
                this.outer.removeChild(this.sidebar);
                this.domStore.appendChild(this.sidebar.domNode);
                domClass.remove(this.sideBarToggle, 'close');
                domClass.add(this.sideBarToggle, 'open');
            } else {
                this.domStore.removeChild(this.sidebar.domNode);
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

    var widgetLoaders = {
        scalebar: function(widgetConfig) {
            require(['esri/dijit/Scalebar'], lang.hitch(this, function(Scalebar) {
                this.scalebar = new Scalebar({
                    map: this.map,
                    attachTo: widgetConfig.options.attachTo,
                    scalebarStyle: widgetConfig.options.scalebarStyle,
                    scalebarUnit: widgetConfig.options.scalebarUnit
                });
            }));
        },
        legend: function(widgetConfig, position) {
            var legendTP = this._createTitlePane(widgetConfig.title, position, widgetConfig.open);
            require(['esri/dijit/Legend'], lang.hitch(this, function(Legend) {
                this.legend = new Legend({
                    map: this.map,
                    layerInfos: this.legendLayerInfos
                }, domConstruct.create("div")).placeAt(legendTP.containerNode);
            }));
        },
        TOC: function(widgetConfig, position) {
            var TOCTP = this._createTitlePane(widgetConfig.title, position, widgetConfig.open);
            require(['gis/dijit/TOC'], lang.hitch(this, function(TOC) {
                this.toc = new TOC({
                    map: this.map,
                    layerInfos: this.tocLayerInfos
                }, domConstruct.create("div")).placeAt(TOCTP.containerNode);
                this.toc.startup();
            }));
        },
        bookmarks: function(widgetConfig, position) {
            var bookmarksTP = this._createTitlePane(widgetConfig.title, position, widgetConfig.open);
            require(['gis/dijit/Bookmarks'], lang.hitch(this, function(Bookmarks) {
                this.bookmarks = new Bookmarks({
                    map: this.map,
                    editable: true
                }, domConstruct.create("div")).placeAt(bookmarksTP.containerNode);
                this.bookmarks.startup();
            }));
        },
        draw: function(widgetConfig, position) {
            var drawTP = this._createTitlePane(widgetConfig.title, position, widgetConfig.open);
            require(['gis/dijit/Draw'], lang.hitch(this, function(Draw) {
                this.drawWidget = new Draw({
                    map: this.map,
                    mapClickMode: this.mapClickMode
                }, domConstruct.create("div")).placeAt(drawTP.containerNode);
                this.drawWidget.startup();
            }));
        },
        measure: function(widgetConfig, position) {
            var measureTP = this._createTitlePane(widgetConfig.title, position, widgetConfig.open);
            require(['esri/dijit/Measurement'], lang.hitch(this, function(Measurement) {
                this.measure = new Measurement({
                    map: this.map,
                    mapClickMode: this.mapClickMode,
                    defaultAreaUnit: widgetConfig.defaultAreaUnit,
                    defaultLengthUnit: widgetConfig.defaultLengthUnit
                }, domConstruct.create("div")).placeAt(measureTP.containerNode);
                this.measure.startup();
                aspect.before(this.measure, 'measureArea', lang.hitch(this, 'setMapClickMode', 'measure'));
                aspect.before(this.measure, 'measureDistance', lang.hitch(this, 'setMapClickMode', 'measure'));
                aspect.before(this.measure, 'measureLocation', lang.hitch(this, 'setMapClickMode', 'measure'));
                aspect.after(this.measure, 'closeTool', lang.hitch(this, 'setMapClickMode', this.config.defaultMapClickMode));
            }));
        },
        print: function(widgetConfig, position) {
            var printTP = this._createTitlePane(widgetConfig.title, position, widgetConfig.open);
            require(['gis/dijit/Print'], lang.hitch(this, function(Print) {
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
        directions: function(widgetConfig, position) {
            var directionsTP = this._createTitlePane(widgetConfig.title, position, widgetConfig.open);
            require(['gis/dijit/Directions'], lang.hitch(this, function(Directions) {
                this.directionsWidget = new Directions({
                    map: this.map,
                    options: widgetConfig.options,
                    titlePane: directionsTP
                }, domConstruct.create("div")).placeAt(directionsTP.containerNode);
                this.directionsWidget.startup();
            }));
        },
        editor: function(widgetConfig, position) {
            var editorTP = this._createTitlePane(widgetConfig.title, position, widgetConfig.open);
            require(['gis/dijit/Editor'], lang.hitch(this, function(Editor) {
                this.editor = new Editor({
                    map: this.map,
                    mapClickMode: this.mapClickMode,
                    layerInfos: this.editorLayerInfos,
                    settings: widgetConfig.settings,
                    titlePane: editorTP
                }, domConstruct.create("div")).placeAt(editorTP.containerNode);
                this.editor.startup();
            }));
        },
        locateButton: function(widgetConfig) {
            require(['gis/dijit/LocateButton'], lang.hitch(this, function(LocateButton) {
                var options = widgetConfig.options;
                options.map = this.map;
                this.locateButton = new LocateButton(options, 'locateButton');
                this.locateButton.startup();
            }));
        },
        overviewMap: function(widgetConfig) {
            require(['esri/dijit/OverviewMap'], lang.hitch(this, function(OverviewMap) {
                var options = widgetConfig.options;
                options.map = this.map;
                this.overview = new OverviewMap(options);
                this.overview.startup();
            }));
        },
        homeButton: function(widgetConfig) {
            require(['esri/dijit/HomeButton'], lang.hitch(this, function(HomeButton) {
                var options = widgetConfig.options;
                options.map = this.map;
                if (options.extent) {
                    options.extent = new esri.geometry.Extent(options.extent);
                }
                this.homeButton = new HomeButton(options, 'homeButton');
                this.homeButton.startup();
            }));
        }
    };

    return controller;
});