define([
	'dojo/_base/declare',
	'dijit/_WidgetBase',
	'dijit/_TemplatedMixin',
	'dijit/_WidgetsInTemplateMixin',
	'dojo/dom-construct',
	'dojo/_base/lang',
	'dojo/_base/array',
	'dojo/on',
	'dojo/keys',
	'dojo/store/Memory',
	'dgrid/OnDemandGrid',
	'dgrid/Selection',
	'dgrid/Keyboard',
	'esri/layers/GraphicsLayer',
	'esri/symbols/jsonUtils',
	'esri/graphicsUtils',
	'esri/tasks/FindTask',
	'esri/tasks/FindParameters',
	'esri/geometry/Extent',
	'dojo/text!./Find/templates/Find.html',
	'dojo/i18n!./Find/nls/resource',
	'dijit/form/Form',
	'dijit/form/FilteringSelect',
	'dijit/form/ValidationTextBox',
	'dijit/form/CheckBox',
	'xstyle/css!./Find/css/Find.css'
], function (declare, _WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin, domConstruct, lang, array, on, keys, Memory, OnDemandGrid, Selection, Keyboard, GraphicsLayer, symbolUtils, graphicsUtils, FindTask, FindParameters, Extent, FindTemplate, i18n) {
	return declare([_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin], {
		widgetsInTemplate: true,
		templateString: FindTemplate,
		baseClass: 'gis_FindDijit',
		i18n: i18n,

		// Spatial Reference. uses the map's spatial reference if none provided
		spatialReference: null,

		// Use 0.0001 for decimal degrees (wkid 4326)
		// or 500 for meters/feet
		pointExtentSize: null,

		// default symbology for found features
		defaultSymbols: {
			point: {
				type: 'esriSMS',
				style: 'esriSMSCircle',
				size: 25,
				color: [0, 255, 255, 32],
				angle: 0,
				xoffset: 0,
				yoffset: 0,
				outline: {
					type: 'esriSLS',
					style: 'esriSLSSolid',
					color: [0, 255, 255, 255],
					width: 2
				}
			},
			polyline: {
				type: 'esriSLS',
				style: 'esriSLSSolid',
				color: [0, 255, 255, 255],
				width: 3
			},
			polygon: {
				type: 'esriSFS',
				style: 'esriSFSSolid',
				color: [0, 255, 255, 32],
				outline: {
					type: 'esriSLS',
					style: 'esriSLSSolid',
					color: [0, 255, 255, 255],
					width: 3
				}
			}
		},

		postCreate: function () {
			this.inherited(arguments);

			if (this.spatialReference === null) {
				this.spatialReference = this.map.spatialReference.wkid;
			}
			if (this.pointExtentSize === null) {
				if (this.spatialReference === 4326) { // special case for geographic lat/lng
					this.pointExtentSize = 0.0001;
				} else {
					this.pointExtentSize = 500; // could be feet or meters
				}
			}

			// allow pressing enter key to initiate the search
			this.own(on(this.searchTextDijit, 'keyup', lang.hitch(this, function (evt) {
				if (evt.keyCode === keys.ENTER) {
					this.search();
				}
			})));

			this.queryIdx = 0;

			// add an id so the queries becomes key/value pair store
			var k = 0, queryLen = this.queries.length;
			for (k = 0; k < queryLen; k++) {
				this.queries[k].id = k;
			}

			// add the queries to the drop-down list
			if (queryLen > 1) {
				var queryStore = new Memory({
					data: this.queries
				});
				this.querySelectDijit.set('store', queryStore);
				this.querySelectDijit.set('value', this.queryIdx);
			} else {
				this.querySelectDom.style.display = 'none';
			}

		},

		createGraphicLayers: function () {
			var graphicsLayer = new GraphicsLayer({
				id: 'findGraphics',
				title: 'Find'
			});
			this.map.addLayer(graphicsLayer);
			return graphicsLayer;
		},

		createGraphicsSymbols: function () {
			var symbols, symbolDefinitions;

			symbolDefinitions = lang.mixin( this.defaultSymbols, this.symbols || {});
			var pointSymbol = symbolUtils.fromJson( symbolDefinitions.point );
			var polylineSymbol = symbolUtils.fromJson( symbolDefinitions.polyline );
			var polygonSymbol = symbolUtils.fromJson( symbolDefinitions.polygon );

			symbols = {
				point: pointSymbol,
				polyline: polylineSymbol,
				polygon: polygonSymbol
			};

			return symbols;
		},

		search: function () {
			var query = this.queries[this.queryIdx];
			var searchText = this.searchTextDijit.get('value');
			if (!query || !searchText || searchText.length === 0) {
				return;
			}
			if (query.minChars && (searchText.length < query.minChars)) {
				this.findResultsNode.innerHTML = 'You must enter at least ' + query.minChars + ' characters.';
				this.findResultsNode.style.display = 'block';
				return;
			}

			this.createResultsGrid();
			this.clearResultsGrid();
			this.clearFeatures();
			domConstruct.empty(this.findResultsNode);

			if (!query || !query.url || !query.layerIds || !query.searchFields) {
				return;
			}

			//create find parameters
			var findParams = new FindParameters();
			findParams.returnGeometry = true;
			findParams.layerIds = query.layerIds;
			findParams.searchFields = query.searchFields;
			findParams.layerDefinitions = query.layerDefs;

			findParams.searchText = searchText;
			findParams.contains = !this.containsSearchText.checked;

			findParams.outSpatialReference = {
				wkid: this.spatialReference
			};

			this.findResultsNode.innerHTML = this.i18n.searching;
			this.findResultsNode.style.display = 'block';

			var findTask = new FindTask(query.url);
			findTask.execute(findParams, lang.hitch(this, 'showResults'));
		},

		createResultsGrid: function () {
			if (!this.resultsStore) {
				this.resultsStore = new Memory({
					idProperty: 'id',
					data: []
				});
			}

			if (!this.resultsGrid) {
				var Grid = declare([OnDemandGrid, Keyboard, Selection]);
				this.resultsGrid = new Grid({
					selectionMode: 'single',
					cellNavigation: false,
					showHeader: true,
					store: this.resultsStore,
					columns: {
						layerName: 'Layer',
						foundFieldName: 'Field',
						value: 'Result'
					},
					sort: [{
						attribute: 'value',
						descending: false
					}]
					//minRowsPerPage: 250,
					//maxRowsPerPage: 500
				}, this.findResultsGrid);

				this.resultsGrid.startup();
				this.resultsGrid.on('.dgrid-row:click', lang.hitch(this, 'zoomOnRowClick'));
				this.resultsGrid.on('.dgrid-row:keyup', lang.hitch(this, 'zoomOnKeyboardNavigation'));
			}
		},

		showResults: function (results) {
			var resultText = '';
			this.resultIdx = 0;
			this.results = results;

			if (this.results.length > 0) {
				//var s = (this.results.length === 1) ? '' : 's';
				var s = (this.results.length === 1) ? '' : this.i18n.resultsLabel.multipleResultsSuffix;
				//resultText = this.results.length + ' Result' + s + ' Found';
				resultText = this.results.length + ' ' + this.i18n.resultsLabel.labelPrefix + s + ' ' + this.i18n.resultsLabel.labelSuffix;

				if ( !this.graphicsLayer ) {
					this.graphicsLayer = this.createGraphicLayers();
				}
				if ( !this.graphicsSymbols ){
					this.graphicsSymbols = this.createGraphicsSymbols();
				}
				this.addResultsToGraphicsLayer();
				this.zoomToGraphicsExtent( this.graphicsLayer.graphics );
				this.showResultsGrid();
			} else {
				resultText = 'No Results Found';
			}
			this.findResultsNode.innerHTML = resultText;
		},

		showResultsGrid: function () {
			var query = this.queries[this.queryIdx];
			this.resultsGrid.store.setData(this.results);
			this.resultsGrid.refresh();

			var lyrDisplay = 'block';
			if (query.layerIds.length === 1) {
				lyrDisplay = 'none';
			}
			this.resultsGrid.styleColumn('layerName', 'display:' + lyrDisplay);

			if (query && query.hideGrid !== true) {
				this.findResultsGrid.style.display = 'block';
			}
		},

		addResultsToGraphicsLayer: function () {
			var unique = 0;
			array.forEach(this.results, function (result) {
				// add a unique key for the store
				result.id = unique;
				unique++;

				this.setGraphicSymbol(result.feature);
				this.graphicsLayer.add(result.feature);

			}, this);
		},

		setGraphicSymbol: function ( graphic ) {
			var symbol = this.graphicsSymbols[graphic.geometry.type];
			graphic.setSymbol(symbol);
		},

		zoomToGraphicsExtent: function ( graphics ) {
			var zoomExtent = null;

			if ( graphics.length > 1 ) {
				zoomExtent = graphicsUtils.graphicsExtent(graphics);
			} else if ( graphics.length === 1 ) {
				zoomExtent = this.getExtentFromGeometry( graphics[ 0 ] );
			}

			if (zoomExtent) {
				this.zoomToExtent(zoomExtent);
			}
		},

		getExtentFromGeometry: function ( graphic ) {
			var extent = null;

			switch ( graphic.geometry.type ) {
				case 'point':
					extent = this.getPointFeatureExtent(graphic);
					break;
				default:
					extent = graphicsUtils.graphicsExtent([graphic]);
					break;
			}
			return extent;
		},

		zoomOnRowClick: function (event) {
			var feature = this.getFeatureFromRowEvent(event);
			this.zoomToGraphicsExtent( [ feature ]);
		},

		zoomOnKeyboardNavigation: function (event){
			var keyCode = event.keyCode;
			if ( keyCode === 38 || keyCode === 40 ) {
				var feature = this.getFeatureFromRowEvent(event);
				this.zoomToGraphicsExtent( [ feature ] );
			}
		},

		getFeatureFromRowEvent: function (event) {
			var row = this.resultsGrid.row(event);
			if (!row){
				return null;
			}

			var data = row.data;
			if (!data) {
				return null;
			}

			return data.feature;
		},

		zoomToExtent: function (extent) {
			this.map.setExtent(extent.expand(1.2));
		},

		clearResults: function () {
			this.results = null;
			this.clearResultsGrid();
			this.clearFeatures();
			this.searchFormDijit.reset();
			this.querySelectDijit.setValue(this.queryIdx);
			domConstruct.empty(this.findResultsNode);
		},

		clearResultsGrid: function () {
			if (this.resultStore) {
				this.resultsStore.setData([]);
			}
			if (this.resultsGrid) {
				this.resultsGrid.refresh();
			}
			this.findResultsNode.style.display = 'none';
			this.findResultsGrid.style.display = 'none';
		},

		clearFeatures: function () {
			if ( this.graphicsLayer ) {
				this.graphicsLayer.clear();
			}
		},

		getPointFeatureExtent: function (point) {
			var sz = this.pointExtentSize; // hack
			var pointGeometry = point.geometry;
			return new Extent({
				'xmin': pointGeometry.x - sz,
				'ymin': pointGeometry.y - sz,
				'xmax': pointGeometry.x + sz,
				'ymax': pointGeometry.y + sz,
				'spatialReference': {
					wkid: this.spatialReference
				}
			});
		},

		_onQueryChange: function (queryIdx) {
			if (queryIdx >= 0 && queryIdx < this.queries.length) {
				this.queryIdx = queryIdx;
			}
		}
	});
});