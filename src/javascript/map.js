import mapbox from "mapbox-gl"

class Map {

  constructor($container, accessToken) {
    mapbox.accessToken = accessToken;
    this.$container = $container;
    this.locationCount = 0;
  }

  init($container) {
    this.map = new mapbox.Map({
      container: this.$container,
      style: "mapbox://styles/stubennett/cijizel74006xb3m1tjsvyk7h",
      center: [-1.8, 52.79], // starting position
      zoom: 12, // starting zoom,
      width: "100%"
    });

    this.map.on("style.load", () => {
      // this.doAdd("single-point"); 
    });
  }

  doAdd(name, color = "#007cbf") {
   console.log(name);
    this.map.addSource(name, {
      "type": "geojson",
      "data": {
        "type": "FeatureCollection",
        "features": []
      }
    });


    this.map.addLayer({
      "id": name + "-point",
      "source": name,
      "type": "circle",
      "paint": {
        "circle-radius": 10,
        "circle-color": color
      }
    });
  }

  markLocation(lat, lng) {
    let data = {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [lng, lat]
      }
    };

    let name = "location-" + (++this.locationCount);
    console.log(lat);
    console.log(lng);
    this.doAdd(name);
    this.map.getSource(name).setData(data);
  }    
  
  focusOn(lat, lng) { 
    this.map.flyTo({
      center: [
	lng, lat
      ]
    });
}
}

export default Map;

