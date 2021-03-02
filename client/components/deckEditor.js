export const deckEditor = {
    props: {
      id: Number
    },
    template: `
      <div class="deckEdit">
        <table id="cardTypesList">
          <tr><th>ID</th><th>Properties</th><th>Count</th></tr>
            <!-- <td><input class="id" value="example"></td><td class="properties"></td><td><input class="count" type="number" value="1" min="0" max="1000"></td>
          <script id="template-cardtypeslist-property-entry" type="text/template">
            <label>Example:</label> <input><button class="uploadAsset">⬆️ Upload</button><br>
          </script> -->
        </table>
        <button id="decrementAllCardTypes">All -1</button><button id="incrementAllCardTypes">All +1</button>
      </div>
    `
}