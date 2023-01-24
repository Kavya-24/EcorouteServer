const turf = require("@turf/turf");
class Util {

    static MAPBOX_DOMAIN = "https://api.mapbox.com/";
    static ACCESS_TOKEN =
    "access_token=pk.eyJ1Ijoia2F2eWEtMjQiLCJhIjoiY2w2Y2xhc2JpMW80MjNrcDNuZ3hwdDVxNSJ9.yRixm6cK2FVMVYiBk8AbDw";
    
    static ISOCHRONE_QUERY_TYPE = "isochrone/v1/mapbox/driving/";
    static CONTOUR_QUERY = "?contours_minutes=60";
    static ISOCHRONE_OPTION = "&contours_colors=6706ce&polygons=true";
    
    static DIRECTION_QUERY_TYPE = "directions/v5/mapbox/driving/"

    static distanceOptions = {units: 'kilometers'};

    //private
    static convertSOC (soc) {
        return soc * 0.6
    }

    //public
    static getIsochroneURL(_lat, _lon, _soc){
    
        return this.MAPBOX_DOMAIN +
            this.ISOCHRONE_QUERY_TYPE +
            _lon +
            "," +
            _lat +
            `?contours_minutes=${this.convertSOC(_soc)}` +
            this.ISOCHRONE_OPTION + "&" +
            this.ACCESS_TOKEN;
    
    }

    //private
    static getQueryLiteralFromPath(path){
        var query = ""
        for(var p =0; p < path.length; p++){
            query += String(path[p][0]) + "," + String(path[p][1]);
            if(p != path.length -1){
                query += ";"
            }
        }

        return query
    }

    //public
    static getDirectionsURL(path){
        return this.MAPBOX_DOMAIN + this.DIRECTION_QUERY_TYPE + this.getQueryLiteralFromPath(path) + "?" +this.ACCESS_TOKEN
    }

    //private
    static getBoundingPolygon(coordinates){
        
      var polygonCoordinates = [];
      for (let i = 0; i < coordinates.length; i++) {
        polygonCoordinates.push([coordinates[i][0], coordinates[i][1]]);
      }

      return turf.polygon([polygonCoordinates]);

    }


    //public
    static destinationPresentInBoundingBox(_lat, _lon, isochroneResponse, chargingStationsData){

        var destinationPoint = turf.point([_lon, _lat])
        var boundingPolygon = this.getBoundingPolygon(isochroneResponse.features[0].geometry.coordinates[0]);
        return turf.booleanPointInPolygon(destinationPoint, boundingPolygon);
        
    }

    //private
    static findStationsInIsochrone(chargingStationsData, boundingPolygon){
        
        let evStations = []
        for(var i=0; i < chargingStationsData.length; i++){
            var c = chargingStationsData[i];
        
            if(turf.booleanPointInPolygon(turf.point([c.position.lon, c.position.lat]), boundingPolygon)){
                
                evStations.push(c);
            }
        }

        return evStations

    }

    //private
    static astar_cost(_srcPoint, _dstPoint, _stationPoint){
            return turf.distance(_srcPoint, _stationPoint, this.distanceOptions) +  turf.distance(_dstPoint, _stationPoint, this.distanceOptions);
    }

    //public
    static findAdmissibleChargingStation(_lat, _lon, isochroneResponse, chargingStationsData, _dstLat, _dstLon, stops){
        
        var srcPoint = turf.point([_lon, _lat])
        var dstPoint = turf.point([_dstLon, _dstLat])

        var boundingPolygon = this.getBoundingPolygon(isochroneResponse.features[0].geometry.coordinates[0]);
        
        //We have to find all the evstations in the bounding polygon
        var admissibleStations = this.findStationsInIsochrone(chargingStationsData, boundingPolygon);
        
        //Now out of all these admissibleStations, we need to find the station which optimally fits the A* approach, and is already not used/visited. 
        var fn = Number.MAX_VALUE
        var station = null

        for(var i=0; i<admissibleStations.length; i++){
            //Finding the distance from
            var c = admissibleStations[i];
            if(this.astar_cost(srcPoint, dstPoint, turf.point([c.position.lon, c.position.lat])) < fn && stops.has(c) === false){
                station = c;
            }
        }

        return station
    }

}

/**
 * Query helpers
 * Rajiv Chowk : lat1=28.6304&lon1=77.2177
 * DLF Mall : lat2=28.5673&lon2=77.3211
 * OCP: lat2=28.4901&lon2=77.5143 
 * IITP: lat2=25.5376569&lon2=84.8481432
 */

module.exports= Util;