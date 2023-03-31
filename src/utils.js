const turf = require("@turf/turf");
const time_coefficient = require('./timeobjective')
const energy_coefficient = require('./energyobjective')

class Util {
  
  static distanceOptions = { units: "kilometers" };
  
  
  static printFn(p_station){

    
    console.log('\"'+p_station._station.poi.name + "\",")
    console.log('[' +[p_station._station.position.lat, p_station._station.position.lon]+"],")
  }


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

  static line_distance(_srcPoint, _dstPoint,_stationPoint){
    const midpoint = turf.midpoint(_srcPoint, _dstPoint);
    return turf.distance(_stationPoint,midpoint, this.distanceOptions)
  }
  static cost_function(_srcPoint, _dstPoint, _stationPoint){
    var cost_gn = turf.distance(_srcPoint, _stationPoint, this.distanceOptions);
    var cost_hn = turf.distance(_dstPoint, _stationPoint, this.distanceOptions);
    var cost_ln = this.line_distance(_srcPoint,_dstPoint,_stationPoint);
    return {_gn:cost_gn, _hn:cost_hn, _ln:cost_ln}
  }


  static sortStations(a, b) {
    
    const weightSource = 0.1;          // prioritize distance to source over distance to destination
    const weightDestination = 0.5;
    const weightLine = 0.4;
    var aScore = (weightSource * a._cost_object._gn) + (weightDestination * a._cost_object._hn) + (weightLine* a._cost_object._ln);
    var bScore = (weightSource * b._cost_object._gn) + (weightDestination * b._cost_object._hn) + (weightLine* b._cost_object._ln);
    return aScore - bScore;
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
        var cost_object = this.cost_function(
          srcPoint,
          dstPoint,
          turf.point([this.coordinate_parse(c.position.lon), this.coordinate_parse(c.position.lat)])
        );

        if (stops.has(c) === false) {
          stationsInQueue.push({ _cost_object: cost_object, _station: c });
        }
      }
    }

    stationsInQueue.sort(this.sortStations)
    console.log("Stations found: " + stationsInQueue.length)

    
    // for(let i=0; i<stationsInQueue.length; i++){
    //   this.printFn(stationsInQueue[i])
    // } 

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

  static coordinate_parse(str){
    return parseFloat(str).toFixed(8);
  }


  static async request_appropriate_station(admissibleStations, evCar)
  {

    //now, here we have the stations. 
    
    return admissibleStations[0]._station

  }

  static async findAdmissibleChargingStation(
    srcLatitude,
    srcLongitude,
    isochroneResponse,
    chargingStationsData,
    dstLatitude,
    dstLongitude,
    stops,
    measure,
    evCar
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

      console.log("\n\nUnOptimized Metric: ")
      this.printFn(admissibleStations[0])

      return await this.request_appropriate_station(admissibleStations,evCar)
    }

    if(measure === "time"){
      var _station = await time_coefficient.optimize(admissibleStations, srcLatitude, srcLongitude) 
      return _station
    }
    
    var _station = await energy_coefficient.optimize(admissibleStations, srcLatitude, srcLongitude)
    this.printFn(admissibleStations[_station])
    return admissibleStations[_station]._station
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
