class interfaces {
  static MAPBOX_DOMAIN = 'https://api.mapbox.com/'
  static ACCESS_TOKEN =
    'access_token=pk.eyJ1Ijoia2F2eWEtMjQiLCJhIjoiY2w2Y2xhc2JpMW80MjNrcDNuZ3hwdDVxNSJ9.yRixm6cK2FVMVYiBk8AbDw'

  static ISOCHRONE_QUERY_TYPE = 'isochrone/v1/mapbox/driving/'
  static CONTOUR_QUERY = '?contours_minutes=60'
  static ISOCHRONE_OPTION = '&contours_colors=6706ce&polygons=true'

  static DIRECTION_QUERY_TYPE = 'directions/v5/mapbox/driving/'

  static MATRIX_QUERY_TYPE = 'directions-matrix/v1/mapbox/walking/'


  //Helpers

  static convertSOC(soc) {
    return parseInt(soc * 0.6,10)
  }

  static getQueryLiteralCoordinates(path) {
        var query = "";
        for (var p = 0; p < path.length; p++) {
            query += String(path[p][0]) + "," + String(path[p][1]);
            if (p != path.length - 1) {
            query += ";";
            }
        }
        return query;

    }

  static getIsochroneURL(_lat, _lon, _soc) {
    return (
      this.MAPBOX_DOMAIN +
      this.ISOCHRONE_QUERY_TYPE +
      _lon +
      ',' +
      _lat +
      `?contours_minutes=${this.convertSOC(_soc)}` +
      this.ISOCHRONE_OPTION +
      '&' +
      this.ACCESS_TOKEN
    )
  }

  
  
  static getDirectionsURL(path) {
    return (
      this.MAPBOX_DOMAIN +
      this.DIRECTION_QUERY_TYPE +
      this.getQueryLiteralCoordinates(path) +
      "?" +
      this.ACCESS_TOKEN
    );
  }


  static getMatrixURL(path) {
    return (
      this.MAPBOX_DOMAIN +
      this.MATRIX_QUERY_TYPE+
      this.getQueryLiteralCoordinates(path) +
      "?sources=0&annotations=distance,duration" +
      "&" + 
      this.ACCESS_TOKEN
    );
  }

  


}

module.exports = interfaces
