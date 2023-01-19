const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require("fs");
const fetch = require('./fetchtimeout');
const turf  = require('@turf/turf');

/**
 * MAPBOX TOKENS
 */

//Mapbox Constants
var MAPBOX_DOMAIN = "https://api.mapbox.com/"
var ACCESS_TOKEN = "&access_token=pk.eyJ1Ijoia2F2eWEtMjQiLCJhIjoiY2w2Y2xhc2JpMW80MjNrcDNuZ3hwdDVxNSJ9.yRixm6cK2FVMVYiBk8AbDw";


var ISOCHRONE_QUERY_TYPE = "isochrone/v1/mapbox/driving/"
var CONTOUR_QUERY = "?contours_minutes=60"
var ISOCHRONE_OPTION = "&contours_colors=6706ce&polygons=true"




const app = express();

app.use(helmet());

app.use(bodyParser.json());

app.use(cors());

app.get('/', (req, res) => {
  res.send("No Endpoint Found");
});


app.get('/getallstations', function (req, res) {
   fs.readFile( __dirname + "./../assets/" + "EV_STATION_DATA.json", 'utf8', function (err, data) {
      res.end( data );
   });
})

app.get('/getcurrentisochrone', function(req, res){
    const lat = req.query.lat;
    const lon = req.query.lon;

        let URL = MAPBOX_DOMAIN + ISOCHRONE_QUERY_TYPE + lon + "," + lat + CONTOUR_QUERY + ISOCHRONE_OPTION + ACCESS_TOKEN
        console.log(URL)
       
        fetch(URL, {method: 'GET'}, 15000) // throw after max 5 seconds timeout error
                            .then(response => response.json())
                            .then(response => {
                                console.log(JSON.stringify(response))
                                res.send(JSON.stringify(response))

                            } )
                            .catch((e) => {
                                console.log("error")
                                console.log(e)
                                res.send("error")
                            })
    
})


app.get('/getnearbystations', function(req, res){
    const lat = req.query.lat;
    const lon = req.query.lon;


        let URL = MAPBOX_DOMAIN + ISOCHRONE_QUERY_TYPE + lon + "," + lat + CONTOUR_QUERY + ISOCHRONE_OPTION + ACCESS_TOKEN
        console.log(URL)
       
        fetch(URL, {method: 'GET'}, 15000) // throw after max 5 seconds timeout error
                            .then(response => response.json())
                            .then(response => {
                                // console.log(response.features[0].geometry.coordinates[0].length)
                                res.send(searchForStations(response.features[0].geometry.coordinates[0]))

                            } )
                            .catch((e) => {
                                console.log("error")
                                console.log(e)
                                res.send("Timeout Error")
                            })
    
})


function searchForStations(coordinates){

  fs.readFile( __dirname + "./../assets/" + "EV_STATION_DATA.json", 'utf8', function (err, data) {
      const evStationsObject = JSON.parse(data)
      var evPoints = []

      for (var key in evStationsObject) {
        if (evStationsObject.hasOwnProperty(key)) {
          // console.log([evStationsObject[key].position.lon,evStationsObject[key].position.lat]);   
          evPoints.push([evStationsObject[key].position.lon,evStationsObject[key].position.lat]) 
        }
      }

      var polygonCoordinates = []
      for(let i = 0; i < coordinates.length; i++){
        polygonCoordinates.push([coordinates[i][0], coordinates[i][1]])
      }
    
      
      var points = turf.points(evPoints)

      var searchWithin = turf.polygon([polygonCoordinates])
  
      var ptsWithin = turf.pointsWithinPolygon(points, searchWithin);
      console.log(ptsWithin)

      
   });
  
  return "OK"


}

  
app.listen(6001, () => {
  console.log('listening on port 6001');
});