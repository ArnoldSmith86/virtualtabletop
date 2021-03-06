export const deckEditor = {
    props: [
      'widgetState'
    ],
    computed: {
      dynamicProperties() {
        var properties = [];
        for(const face of this.widgetState.faceTemplates) {
          for (const object of face.objects) {
           if(object.valueType == 'dynamic'){
             var propObject = {name: object.value, type: object.type}
             if (!properties.some(prop => prop.name == propObject.name))
                properties.push(propObject);
        }}}
      return properties;
      }
    },
    methods: {
      countCardType(typeID) {
        return widgetFilter(w=>w.p('deck')==this.widgetState.id&&w.p('cardType')==typeID).length;
      },
      async upload(typeID, propName) {
        this.widgetState.cardTypes[typeID][propName] = await uploadAsset();
      },
    },
    template: `
      <div class="deckEdit">
        <table id="cardTypesList">
          <tr><th>ID</th><th>Properties</th><th>Count</th></tr>
            <tr v-for="(typeObject, typeID) in this.widgetState.cardTypes">
              <td><input class="id" :value="typeID"></td>
              <td class="properties">
                <div v-for="prop in dynamicProperties">
                  <label>{{ prop.name }}</label>
                  <input :value="typeObject[prop.name] || '' ">
                  <button v-if="prop.type == 'image'" class="uploadAsset" @click="upload(typeID, prop.name)">⬆️ Upload</button>
                </div>
              </td>
              <td><input class="count" type="number" :value="countCardType(typeID)" min="0" max="1000"></td>
            </tr>
        </table>
        <button id="decrementAllCardTypes">All -1</button><button id="incrementAllCardTypes">All +1</button>
      </div>
    `
}