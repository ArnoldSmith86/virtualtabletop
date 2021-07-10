export const baseEditOverlay = {
  props: {
    jsonEdit: {
      type: Boolean,
      default: false
    }
  },
  methods: {
      update() {
        onClickUpdateWidget(!this.jsonEdit);
      },
      duplicate() {
        onClickDuplicateWidget();
      },
      remove() {
        onClickRemoveWidget();
      },
      manualEdit() {
        onClickManualEditWidget();
      }
  },
  template: `
  <div class="editorButtonsContainer">
    <div class="editorButtonsTop">
      <button id="updateWidget" class="editorButton" @click="update()">Update widget</button>
      <button id="duplicateWidget" class="editorButton" @click="duplicate()">Duplicate widget</button>
      <button id="removeWidget" class="editorButton" @click="remove()">Remove widget</button>
    </div>
      <button v-if="!this.jsonEdit" id="manualEdit" class="editorButton" @click="manualEdit()">Advanced: manually edit JSON (changes above will be discarded)</button>
  </div>
  `
}
