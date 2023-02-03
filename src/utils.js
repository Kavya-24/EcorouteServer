const mapboxClient = require("@mapbox/mapbox-sdk");
const turf = require("@turf/turf");
const fetch = require("./fetchtimeout");
const baseClient = mapboxClient({
  accessToken:
    "pk.eyJ1Ijoia2F2eWEtMjQiLCJhIjoiY2w2Y2xhc2JpMW80MjNrcDNuZ3hwdDVxNSJ9.yRixm6cK2FVMVYiBk8AbDw",
});
const mapboxDirectionService = require("@mapbox/mapbox-sdk/services/directions");
const directionService = mapboxDirectionService(baseClient);

class Util {
  static MAPBOX_DOMAIN = "https://api.mapbox.com/";
  static ACCESS_TOKEN =
    "access_token=pk.eyJ1Ijoia2F2eWEtMjQiLCJhIjoiY2w2Y2xhc2JpMW80MjNrcDNuZ3hwdDVxNSJ9.yRixm6cK2FVMVYiBk8AbDw";

  static ISOCHRONE_QUERY_TYPE = "isochrone/v1/mapbox/driving/";
  static CONTOUR_QUERY = "?contours_minutes=60";
  static ISOCHRONE_OPTION = "&contours_colors=6706ce&polygons=true";

  static DIRECTION_QUERY_TYPE = "directions/v5/mapbox/driving/";

  static distanceOptions = { units: "kilometers" };

  //private
  static convertSOC(soc) {
    return soc * 0.6;
  }

  //public
  static getIsochroneURL(_lat, _lon, _soc) {
    return (
      this.MAPBOX_DOMAIN +
      this.ISOCHRONE_QUERY_TYPE +
      _lon +
      "," +
      _lat +
      `?contours_minutes=${this.convertSOC(_soc)}` +
      this.ISOCHRONE_OPTION +
      "&" +
      this.ACCESS_TOKEN
    );
  }

  //private
  static getQueryLiteralFromPath(path) {
    var query = "";
    for (var p = 0; p < path.length; p++) {
      query += String(path[p][0]) + "," + String(path[p][1]);
      if (p != path.length - 1) {
        query += ";";
      }
    }

    return query;
  }

  //public
  static getDirectionsURL(path) {
    return (
      this.MAPBOX_DOMAIN +
      this.DIRECTION_QUERY_TYPE +
      this.getQueryLiteralFromPath(path) +
      "?" +
      this.ACCESS_TOKEN
    );
  }

  //private
  static getBoundingPolygon(coordinates) {
    var polygonCoordinates = [];
    for (let i = 0; i < coordinates.length; i++) {
      polygonCoordinates.push([coordinates[i][0], coordinates[i][1]]);
    }

    return turf.polygon([polygonCoordinates]);
  }

  //public
  static destinationPresentInBoundingBox(
    _lat,
    _lon,
    isochroneResponse,
    chargingStationsData
  ) {
    var destinationPoint = turf.point([_lon, _lat]);
    var boundingPolygon = this.getBoundingPolygon(
      isochroneResponse.features[0].geometry.coordinates[0]
    );
    return turf.booleanPointInPolygon(destinationPoint, boundingPolygon);
  }

  //private
  static astar_cost(_srcPoint, _dstPoint, _stationPoint) {
    var gn = turf.distance(_srcPoint, _stationPoint, this.distanceOptions);
    var hn = turf.distance(_dstPoint, _stationPoint, this.distanceOptions);
    return gn * (1 / (1 + gn)) + hn;
  }

  //private
  static prioritizeArray(pq) {
    pq.sort(function (a, b) {
      var keyA = a._fn,
        keyB = b._fn;

      if (keyA < keyB) return -1;
      if (keyA > keyB) return 1;
      return 0;
    });

    return pq;
  }

  //private
  static findStationsInIsochrone(
    chargingStationsData,
    boundingPolygon,
    stops,
    srcPoint,
    dstPoint
  ) {
    var stationsInQueue = [];

    for (var i = 0; i < chargingStationsData.length; i++) {
      var c = chargingStationsData[i];

      if (
        turf.booleanPointInPolygon(
          turf.point([c.position.lon, c.position.lat]),
          boundingPolygon
        )
      ) {
        var fn = this.astar_cost(
          srcPoint,
          dstPoint,
          turf.point([c.position.lon, c.position.lat])
        );

        if (stops.has(c) === false) {
          stationsInQueue.push({ _fn: fn, _station: c });
        }
      }
    }

    stationsInQueue = this.prioritizeArray(stationsInQueue);
    console.log("Number of stations: " + stationsInQueue.length);
    return stationsInQueue;
  }

  //private
  static modelIntermediatePath(response) {}

  //private
  static findPathWaypoints(path) {
    var pathWaypoints = [];
    for (let p in path) {
      pathWaypoints.push({
        coordinates: [Number(path[p][0]), Number(path[p][1])],
      });
    }
    return pathWaypoints;
  }
  //private
  static async findIntermediatePath(path) {
    var pathWaypoints = this.findPathWaypoints(path);
    directionService
      .getDirections({
        profile: "driving-traffic",
        waypoints: pathWaypoints,
      })
      .send()
      .then((response) => {
        const directions = response.body;
        console.log(directions.routes[0].legs);
      });
  }

  //private
  static async analyzeStationPath(_lat, _lon, stationsInQueue, idx, T) {
    //We need to find the direct directional path from _src to _station coordinates
    //Then we need to analyze the number of turns, the distance and the time taken
    //We will also calculate the effective height change on each leg of the path

    console.log("T=" + T + " and choosing = " + idx);

    if (T == 0 || idx === stationsInQueue.length) {
      return;
    }

    var _evStation = stationsInQueue[idx]._station;

    var path = [];
    path.push([_lon, _lat]);
    path.push([_evStation.position.lon, _evStation.position.lat]);

    this.findIntermediatePath(path);

    this.analyzeStationPath(_lat, _lon, stationsInQueue, idx + 1, T - 1);
  }

  //public
  static findAdmissibleChargingStation(
    _lat,
    _lon,
    isochroneResponse,
    chargingStationsData,
    _dstLat,
    _dstLon,
    stops
  ) {
    var srcPoint = turf.point([_lon, _lat]);
    var dstPoint = turf.point([_dstLon, _dstLat]);

    var boundingPolygon = this.getBoundingPolygon(
      isochroneResponse.features[0].geometry.coordinates[0]
    );

    //We have to find all the evstations in the bounding polygon and ordered by priority
    var stationsInQueue = this.findStationsInIsochrone(
      chargingStationsData,
      boundingPolygon,
      stops,
      srcPoint,
      dstPoint
    );
    var station = null;

    //Choose the three most optimal stations and find their heuristics and measures
    this.analyzeStationPath(_lat, _lon, stationsInQueue, 0, 1);

    return station;
  }
}

/**
 * Query helpers
 * Rajiv Chowk : lat1=28.6304&lon1=77.2177
 * DLF Mall : lat2=28.5673&lon2=77.3211
 * OCP: lat2=28.4901&lon2=77.5143
 * IITP: lat2=25.5376569&lon2=84.8481432
 * Patna Airport: 25.5950° N, 85.0908° E
 */

module.exports = Util;
