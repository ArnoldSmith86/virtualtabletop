export const deckEditor = {
    props: {
      widgetState: {
        type: Object,
        default: {}
      },
    },
    computed: {
      dynamicProperties() {
        var properties = [];
        for(const face of this.widgetState.faceTemplates) {
          for(const object of face.objects) {
            if(typeof object.dynamicProperties == 'object') {
              for(const parameter in object.dynamicProperties) {
                var propObject = {name: object.dynamicProperties[parameter], type: (parameter == "value")? object.type : "text"}
                if(!properties.some(prop => prop.name == propObject.name))
                  properties.push(propObject);
              }
            }
          }
        }
        return properties;
      }
    },
    methods: {
      countCardType(typeID) {
        return widgetFilter(w=>w.get('deck')==this.widgetState.id&&w.get('cardType')==typeID).length;
      },
      async upload(typeID, propName) {
        this.widgetState.cardTypes[typeID][propName] = await uploadAsset();
      },

      increment() {
        onClickIncrementAllCardTypes();
      },

      decrement() {
        onClickDecrementAllCardTypes()
      },

      async _addCardCallback(imagePath, fileName) {
        let value = {
          "image": imagePath,
        }
        addCardType(fileName, value);
        this.widgetState.cardTypes[fileName] = value;
        const card = { deck:this.widgetState.id, type:'card', cardType:fileName };
        const cardId = addWidgetLocal(card);
        if(this.widgetState.parent)
          await widgets.get(cardId).moveToHolder(widgets.get(this.widgetState.parent));
      },

      async uploadCards() {
        await uploadAsset(this._addCardCallback);
      }
    },
    template: `
      <div class="deckEdit">
        <h1>Edit deck</h1>
        <button @click="uploadCards()">Upload Card Image(s)</button>
        <table id="cardTypesList">
          <tbody><tr><th>ID</th><th>Properties</th><th>Count</th></tr></tbody>
            <tr v-for="(typeObject, typeID) in this.widgetState.cardTypes" class="cardType">
              <td><input class="id" :value="typeID" :data-old-i-d="typeID"></td>
              <td class="properties">
                <div v-for="prop in dynamicProperties">
                  <label>{{ prop.name }}</label>&nbsp;
                  <input v-if="((typeof typeObject[prop.name] === 'string') && (isNaN(typeObject[prop.name]) === true) && (typeObject[prop.name] !== 'true') && (typeObject[prop.name] !== 'false') )" :value="typeObject[prop.name].replaceAll('\\n', '\\u005Cn')">
                  <input v-else-if="typeof typeObject[prop.name] === 'string'" :value="'\\u0022'+typeObject[prop.name]+'\\u0022'">
                  <input v-else-if="typeObject[prop.name] !== undefined ||  typeObject[prop.name] !== null" :value="typeObject[prop.name]">
                  <input v-else :value=null>
                  <button v-if="prop.type == 'image'" class="uploadAsset prettyButton" @click="upload(typeID, prop.name)">Upload</button>
                </div>
              </td>
              <td><input class="count" type="number" :value="countCardType(typeID)" :data-old-value="countCardType(typeID)" min="0" max="1000"></td>
            </tr>
        </table>
        <button id="decrementAllCardTypes" @click="decrement()">All -1</button><button id="incrementAllCardTypes" @click="increment()">All +1</button>
      </div>
    `
}
