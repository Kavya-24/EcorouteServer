const turf = require("@turf/turf");
const time_coefficient = require('./timeobjective')
const energy_coefficient = require('./energyobjective')

class Util {
  
  static distanceOptions = { units: "kilometers" };
  
  //private
  static getBoundingPolygon(coordinates) {
    var polygonCoordinates = [];
    for (let i = 0; i < coordinates.length; i++) {
      polygonCoordinates.push([coordinates[i][0], coordinates[i][1]]);
    }

    return turf.polygon([polygonCoordinates]);
  }

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
  static astar_cost(_srcPoint, _dstPoint, _stationPoint) {
    var gn = turf.distance(_srcPoint, _stationPoint, this.distanceOptions);
    var hn = turf.distance(_dstPoint, _stationPoint, this.distanceOptions);
    return gn + hn;
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
    
    console.log("Stations found: " + stationsInQueue.length)
    if(stationsInQueue.length === 9){
      for(let i =0; i <= stationsInQueue.length; i++){
        console.log(stationsInQueue[i])
      }
    }
    return stationsInQueue;
  }

  //public
  static destinationPresentInBoundingBox(_lat, _lon, isochroneResponse) {
    var destinationPoint = turf.point([_lon, _lat]);
    var boundingPolygon = this.getBoundingPolygon(
      isochroneResponse.features[0].geometry.coordinates[0]
    );
    return turf.booleanPointInPolygon(destinationPoint, boundingPolygon);
  }

  static async findAdmissibleChargingStation(
    srcLatitude,
    srcLongitude,
    isochroneResponse,
    chargingStationsData,
    dstLatitude,
    dstLongitude,
    stops,
    measure
  ) {
    var srcPoint = turf.point([srcLongitude, srcLatitude]);
    var dstPoint = turf.point([dstLongitude, dstLatitude]);

    var boundingPolygon = this.getBoundingPolygon(
      isochroneResponse.features[0].geometry.coordinates[0]
    );

    var admissibleStations = this.findStationsInIsochrone(
      chargingStationsData,
      boundingPolygon,
      stops,
      srcPoint,
      dstPoint
    );

  
    if(admissibleStations.length < 1){
      return null
    }

    if(measure === "unoptimized"){
      return admissibleStations[0]._station
    }

    if(measure === "time"){
      var _station = await time_coefficient.optimize(admissibleStations, srcLatitude, srcLongitude) 
      return _station
    }
    
    var _station = energy_coefficient.optimize(admissibleStations, srcLatitude, srcLongitude)
    return _station
  }
}

/**
 * http://localhost:6001/ecoroutePath?lat1=28.6304&lon1=77.2177&lat2=26.9124&lon2=75.7873&soc=10&measure=petrol
 * Query helpers
 * Rajiv Chowk : lat1=28.6304&lon1=77.2177
 * DLF Mall : lat2=28.5673&lon2=77.3211
 * OCP: lat2=28.4901&lon2=77.5143
 * IITP: lat2=25.5376569&lon2=84.8481432
 * Patna Airport: 25.5950° N, 85.0908° E
 */

module.exports = Util;
