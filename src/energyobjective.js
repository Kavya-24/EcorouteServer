class EnergyObjective {

  /**Heigh Task: Add the heights in the data itself */
  static height_weight(directions) {
    return 0;
  }

  static sortStations(a, b) {
    
    var aWeight = a._step_weight
    var bWeight = a._step_weight
    return aWeight - bWeight;
  }

  /***admissibleStations is a list of {_station, _response} according to the A* algorithm measure.*/
  static async optimize(admissibleStations, srcLatitude, srcLongitude, dstLatitude, dstLongitude) {
    
    if (admissibleStations.length < 1) {
      return null;
    }

    return admissibleStations;
  }
}

module.exports = EnergyObjective;
