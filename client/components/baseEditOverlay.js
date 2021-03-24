export const baseEditOverlay = {
  methods: {
      update() {
        onClickUpdateWidget();
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
    <button id="updateWidget" @click="update()">Update widget</button>
    <button id="duplicateWidget" @click="duplicate()">Duplicate widget</button>
    <button id="removeWidget" @click="remove()">Remove widget</button>
    <button id="manualEdit" @click="manualEdit()">Advanced: manually edit JSON (changes above will be discarded)</button>
  `
}