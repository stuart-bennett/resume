import mapbox from "mapbox-gl"

class Map {

  contructor($container, accessToken) {
    mapbox.accessToken = accessToken;
  }

  init($container) {
    this.map = new mapbox.Map({
      container: $container
    });
  }    
}

export default Map;

