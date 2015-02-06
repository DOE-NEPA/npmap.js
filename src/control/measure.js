/* global L */
/* jshint camelcase: false */

'use strict';

var util = require('../util/util');

require('leaflet-draw');

var MeasureControl = L.Control.extend({
  includes: L.Mixin.Events,
  options: {
    polygon: {
      allowIntersection: false,
      drawError: {
        color: '#f06eaa',
        message: 'Invalid geometry',
        timeout: 400
      },
      repeatMode: true,
      shapeOptions: {
        color: 'rgb(255, 0, 0)',
        weight: 2
      }
    },
    polyline: {
      repeatMode: true,
      shapeOptions: {
        color: 'rgb(255, 0, 0)',
        weight: 2
      }
    },
    position: 'topleft',
    units: {
      area: [
        'ac',
        'ha'
      ],
      distance: [
        'mi',
        'ft',
        'm'
      ]
    }
  },
  // TODO: Also store conversion formulas here.
  units: {
    area: {
      'ac': 'Acres',
      'ha': 'Hectares'
    },
    distance: {
      'ft': 'Feet',
      'm': 'Meters',
      'mi': 'Miles'
    }
  },
  initialize: function(options) {
    L.Util.setOptions(this, options);
    this._activeMode = null;
    this._activePoint = null;
    this._activePolygon = null;
    this._activeTooltip = null;
    this._featureGroup = new L.FeatureGroup();
    this._modes = {};

    if (this.options && this.options.units) {
      var unit;

      if (this.options.units.area && this.options.units.area.length) {
        // TODO: Verify this is a supported unit.
        unit = this.options.units.area[0];
        this._activeUnitArea = unit;
        this._lastUnitArea = unit;
      }

      if (this.options.units.distance && this.options.units.distance.length) {
        // TODO: Verify this is a supported unit.
        unit = this.options.units.distance[0];
        this._activeUnitDistance = unit;
        this._lastUnitDistance = unit;
      }
    }

    return this;
  },
  onAdd: function(map) {
    if (this._activeUnitArea || this._activeUnitDistance) {
      var liSelect = document.createElement('li'),
        html, i, unit;

      this._container = L.DomUtil.create('div', 'leaflet-bar leaflet-control npmap-control-measure');
      this._map = map;
      this._menu = L.DomUtil.create('ul', '', this._container);
      this._button = L.DomUtil.create('button', 'leaflet-bar-single measure-control', this._container);

      if (this._activeUnitArea) {
        var liArea = L.DomUtil.create('li', '', this._menu);

        html = '';
        this._buttonArea = L.DomUtil.create('button', 'pressed', liArea);
        this._buttonArea.innerHTML = 'Area';
        this._selectUnitArea = L.DomUtil.create('select', '', liSelect);

        // TODO: Verify this is a supported unit.
        for (i = 0; i < this.options.units.area.length; i++) {
          unit = this.options.units.area[i];
          html += '<option value="' + unit + '"' + (i === 0 ? ' selected' : '') + '>' + this.units.area[unit] + '</option>';
        }

        this._selectUnitArea.innerHTML = html;
      }

      if (this._activeUnitDistance) {
        var liDistance = L.DomUtil.create('li', '', this._menu),
          me = this;

        html = '';
        this._buttonDistance = L.DomUtil.create('button', (function() {
          if (me._buttonArea) {
            return '';
          } else {
            return 'pressed';
          }
        })(), liDistance);
        this._buttonDistance.innerHTML = 'Distance';
        this._selectUnitDistance = L.DomUtil.create('select', '', liSelect);

        // TODO: Verify this is a supported unit.
        for (i = 0; i < this.options.units.distance.length; i++) {
          unit = this.options.units.distance[i];
          html += '<option value="' + unit + '"' + (i === 0 ? ' selected' : '') + '>' + this.units.distance[unit] + '</option>';
        }

        this._selectUnitDistance.innerHTML = html;
      }

      this._menu.appendChild(liSelect);
      map.addLayer(this._featureGroup);
      this._initializeMode(this._buttonArea, new L.Draw.Polygon(map, this.options.polygon));
      this._initializeMode(this._buttonDistance, new L.Draw.Polyline(map, this.options.polyline));
      this._setupListeners();

      return this._container;
    } else {
      throw new Error('No valid units specified for measure control!');
    }
  },
  _buildTooltipArea: function(total) {
    return '' +
      '<div class="leaflet-measure-tooltip-area">' +
        '<div class="leaflet-measure-tooltip-total">' +
          '<span>' +
            total.toFixed(2) + ' ' + this._activeUnitArea +
          '</span>' +
        '</div>' +
      '</div>' +
    '';
  },
  _buildTooltipDistance: function(total, difference) {
    var html = '' +
        '<div class="leaflet-measure-tooltip-distance">' +
          '<div class="leaflet-measure-tooltip-total">' +
            '<span>' +
              total.toFixed(2) + ' ' + this._activeUnitDistance +
            '</span>' +
            '<span>' +
              total +
            '</span>' +
          '</div>' +
        '' +
      '',
      number = total;

    if (typeof difference !== 'undefined' && (difference !== 0) && (difference !== total)) {
      html += '' +
        '' +
          '<div class="leaflet-measure-tooltip-difference">' +
            '<span>' +
              '(+' + difference.toFixed(2) + ' ' + this._activeUnitDistance + ')' +
            '</span>' +
            '<span>' +
              difference +
            '</span>' +
          '</div>' +
        '' +
      '';
      number = difference;
    }

    return html + '</div>';
  },
  _buttonClick: function(e, manual) {
    var button = e.target;

    if (manual || !L.DomUtil.hasClass(button, 'pressed')) {
      var add, mode, remove;

      if (button.innerHTML.toLowerCase() === 'distance') {
        add = this._buttonDistance;
        mode = 'distance';

        if (this._selectUnitArea) {
          this._selectUnitArea.style.display = 'none';
          remove = this._buttonArea;
          this._modes.polygon.handler.disable();
        }

        this._selectUnitDistance.style.display = 'block';
        this._modes.polyline.handler.enable();
      } else {
        add = this._buttonArea;
        mode = 'area';

        if (this._selectUnitDistance) {
          this._selectUnitDistance.style.display = 'none';
          remove = this._buttonDistance;
          this._modes.polyline.handler.disable();
        }

        this._selectUnitArea.style.display = 'block';
        this._modes.polygon.handler.enable();
      }

      L.DomUtil.addClass(add, 'pressed');

      if (remove) {
        L.DomUtil.removeClass(remove, 'pressed');
      }

      this._startMeasuring(mode);
    }
  },
  _calculateArea: function(to, val, from) {
    from = from || 'm';

    if (from !== to) {
      if (from === 'ac') {
        switch (to) {
        case 'ha':
          val = val / 2.47105;
          break;
        case 'm':
          val = val * 4046.85642;
          break;
        }
      } else if (from === 'ha') {
        switch (to) {
        case 'ac':
          val = val * 2.47105;
          break;
        case 'm':
          val = val * 10000;
          break;
        }
      } else if (from === 'm') {
        switch (to) {
        case 'ac':
          val = val / 4046.85642;
          break;
        case 'ha':
          val = val / 10000;
          break;
        }
      }
    }

    return val;
  },
  _calculateDistance: function(to, val, from) {
    from = from || 'm';

    if (from !== to) {
      if (from === 'ft') {
        switch (to) {
        case 'm':
          val = val / 3.28084;
          break;
        case 'mi':
          val = val / 5280;
          break;
        }
      } else if (from === 'm') {
        switch (to) {
        case 'ft':
          val = val * 3.28084;
          break;
        case 'mi':
          val = val * 0.000621371192;
          break;
        }
      } else if (from === 'mi') {
        switch (to) {
        case 'ft':
          val = val * 5280;
          break;
        case 'm':
          val = val * 1609.344;
          break;
        }
      }
    }

    return val;
  },
  _createTooltip: function(latLng, text) {
    return new L.Marker(latLng, {
      clickable: false,
      icon: new L.DivIcon({
        className: 'leaflet-measure-tooltip',
        html: text,
        iconAnchor: [
          -5,
          -5
        ]
      })
    }).addTo(this._featureGroup);
  },
  _handlerActivated: function(e) {
    if (this._activeMode && this._activeMode.handler.enabled()) {
      this._activeMode.handler.disable();
    }

    this._activeMode = this._modes[e.handler];
    this.fire('enable');
  },
  _handlerDeactivated: function() {
    this._activeMode = null;
    this._activePoint = null;
    this._activePolygon = null;
    this._activeTooltip = null;
    this._area = 0;
    this._currentCircles = [];
    this._distance = 0;
    this._layerGroupPath = null;
    this._tempTooltip = null;
    this.fire('disable');
  },
  _initializeMode: function(button, handler) {
    var type = handler.type;

    this._modes[type] = {
      button: button,
      handler: handler
    };
    this._modes[type].handler
      .on('disabled', this._handlerDeactivated, this)
      .on('enabled', this._handlerActivated, this);
  },
  // TODO: Add circlemarkers at the vertices, and make these clickable to finish the measurement.
  _mouseClickArea: function(e) {
    var latLng = e.latlng;

    if (this._activePolygon) {
      var latLngs;

      this._activePolygon.addLatLng(latLng);
      latLngs = this._activePolygon.getLatLngs();

      if (latLngs.length > 2) {
        if (this._activeTooltip) {
          this._featureGroup.removeLayer(this._activeTooltip);
        }

        this._area = this._calculateArea(this._activeUnitArea, L.GeometryUtil.geodesicArea(latLngs));
        this._activeTooltip = this._createTooltip(latLng, this._buildTooltipArea(this._area));
      }
    } else {
      this._activePolygon = new L.Polygon([
        latLng
      ]);
      this._area = 0;
    }

    if (this._tempTooltip) {
      this._removeTempTooltip();
    }
  },
  // TODO: Add circlemarkers at the vertices, and make these clickable to finish the measurement.
  _mouseClickDistance: function(e) {
    var latLng = e.latlng;

    if (this._activePoint) {
      var distance = this._calculateDistance(this._activeUnitDistance, latLng.distanceTo(this._activePoint));

      this._distance = this._distance + distance;
      this._activeTooltip = this._createTooltip(latLng, this._buildTooltipDistance(this._distance, distance));
    } else {
      this._distance = 0;
    }

    this._activePoint = latLng;

    if (this._tempTooltip) {
      this._removeTempTooltip();
    }
  },
  _mouseMove: function(e) {
    var latLng = e.latlng;

    if (!latLng || !this._activePoint) {
      return;
    }

    if (!L.DomUtil.hasClass(this._buttonArea, 'pressed')) {
      this._mouseMoveDistance(latLng);
    }
  },
  _mouseMoveDistance: function(latLng) {
    var distance = this._calculateDistance(this._activeUnitDistance, latLng.distanceTo(this._activePoint)),
      html = this._buildTooltipDistance(this._distance + distance);

    if (this._tempTooltip) {
      this._updateTooltip(latLng, html, this._tempTooltip);
    } else {
      this._tempTooltip = this._createTooltip(latLng, html);
    }
  },
  _onKeyDown: function (e) {
    if (e.keyCode === 27) {
      this._toggleMeasure();
    }
  },
  _onSelectUnitArea: function() {
    var tooltips = util.getElementsByClassName('leaflet-measure-tooltip-area');

    this._lastUnitArea = this._activeUnitArea;
    this._activeUnitArea = this._selectUnitArea.options[this._selectUnitArea.selectedIndex].value;

    for (var i = 0; i < tooltips.length; i++) {
      var tooltip = tooltips[i],
        node = tooltip.childNodes[0].childNodes[0];

      tooltip.parentNode.innerHTML = this._buildTooltipArea(this._calculateArea(this._activeUnitArea, parseFloat(node.innerHTML), this._lastUnitArea));
    }
  },
  _onSelectUnitDistance: function() {
    var tooltips = util.getElementsByClassName('leaflet-measure-tooltip-distance');

    this._lastUnitDistance = this._activeUnitDistance;
    this._activeUnitDistance = this._selectUnitDistance.options[this._selectUnitDistance.selectedIndex].value;

    for (var i = 0; i < tooltips.length; i++) {
      var tooltip = tooltips[i],
        childNodes = tooltip.childNodes,
        difference, differenceNode, total, totalNode;

      if (childNodes.length === 2) {
        differenceNode = childNodes[1].childNodes[1];
        totalNode = childNodes[0].childNodes[1];
      } else {
        differenceNode = childNodes[0].childNodes[1];
      }

      difference = this._calculateDistance(this._activeUnitDistance, parseFloat(differenceNode.innerHTML), this._lastUnitDistance);

      if (totalNode) {
        total = this._calculateDistance(this._activeUnitDistance, parseFloat(totalNode.innerHTML), this._lastUnitDistance);
        tooltip.parentNode.innerHTML = this._buildTooltipDistance(total, difference);
      } else {
        tooltip.parentNode.innerHTML = this._buildTooltipDistance(difference);
      }
    }

    if (this._activeTooltip) {
      this._distance = parseFloat(this._activeTooltip._icon.childNodes[0].childNodes[0].childNodes[1].innerHTML);

      // TODO: You should really just update this._tempTooltip with the new distance.
      if (this._tempTooltip) {
        this._removeTempTooltip();
      }
    }
  },
  _removeTempTooltip: function() {
    this._featureGroup.removeLayer(this._tempTooltip);
    this._tempTooltip = null;
  },
  _setupListeners: function() {
    var me = this;

    L.DomEvent
      .disableClickPropagation(this._button)
      .disableClickPropagation(this._menu)
      .on(this._button, 'click', this._toggleMeasure, this);

    if (this._buttonArea) {
      L.DomEvent
        .on(this._buttonArea, 'click', this._buttonClick, this)
        .on(this._selectUnitArea, 'change', this._onSelectUnitArea, this);
    }

    if (this._buttonDistance) {
      L.DomEvent
        .on(this._buttonDistance, 'click', this._buttonClick, this)
        .on(this._selectUnitDistance, 'change', this._onSelectUnitDistance, this);
    }

    this._map.on('draw:created', function(e) {
      me._featureGroup.addLayer(e.layer);
    });
  },
  _startMeasuring: function(type) {
    var map = this._map,
      off = (type === 'area' ? this._mouseClickDistance : this._mouseClickArea),
      on = (type === 'area' ? this._mouseClickArea : this._mouseClickDistance);

    L.DomEvent
      .off(map, 'click', off)
      .on(document, 'keydown', this._onKeyDown, this)
      .on(map, 'click', on, this)
      .on(map, 'dblclick', this._handlerDeactivated, this)
      .on(map, 'mousemove', this._mouseMove, this);
  },
  _stopMeasuring: function(type) {
    var map = this._map,
      off = (type === 'area' ? this._mouseClickArea : this._mouseClickDistance);

    L.DomEvent
      .off(document, 'keydown', this._onKeyDown, this)
      .off(map, 'click', off, this)
      .off(map, 'dblclick', this._handlerDeactivated, this)
      .off(map, 'mousemove', this._mouseMove, this);
  },
  _toggleMeasure: function() {
    var map = this._map;

    if (L.DomUtil.hasClass(this._button, 'pressed')) {
      L.DomUtil.removeClass(this._button, 'pressed');
      this._menu.style.display = 'none';
      this._stopMeasuring(this._clicked);
      this._featureGroup.clearLayers();
      this._map._controllingInteractivity = true;
      this._activeMode.handler.disable();
    } else {
      L.DomUtil.addClass(this._button, 'pressed');
      this._menu.style.display = 'block';

      if (this._buttonArea && L.DomUtil.hasClass(this._buttonArea, 'pressed')) {
        this._buttonClick({
          target: this._buttonArea
        }, true);
      } else {
        this._buttonClick({
          target: this._buttonDistance
        }, true);
      }

      map._controllingInteractivity = false;
    }
  },
  _updateTooltip: function(latLng, html, tooltip) {
    tooltip = tooltip || this._activeTooltip;
    tooltip.setLatLng(latLng);
    tooltip._icon.innerHTML = html;
  },
  activate: function() {
    if (!L.DomUtil.hasClass(this._button, 'pressed')) {
      this._toggleMeasure();
    }
  },
  deactivate: function() {
    if (L.DomUtil.hasClass(this._button, 'pressed')) {
      this._stopMeasuring('area');
      this._toggleMeasure();
    }
  }
});

L.Map.mergeOptions({
  measureControl: false
});

L.Map.addInitHook(function() {
  if (this.options.measureControl) {
    var options = {};

    if (typeof this.options.measureControl === 'object') {
      options = this.options.measureControl;
    }

    this.measureControl = L.npmap.control.measure(options).addTo(this);
  }
});

module.exports = function(options){
  return new MeasureControl(options);
};
