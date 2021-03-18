export const baseEditOverlay = {
  props: {
    widget: {
      type: Object
    },
     previousState: {
       type: Object
     }
  },
  methods: {
      update() {
         var widget = this.widget;
         console.log(widget)
         var previousState = this.previousState;
         applyEditOptions(widget);

         const children = Widget.prototype.children.call(widgets.get(previousState.id));
         const cards = widgetFilter(w=>w.p('deck')==previousState.id);

         if(widget.id !== previousState.id || widget.type !== previousState.type) {
           for(const child of children)
             sendPropertyUpdate(child.p('id'), 'parent', null);
           for(const card of cards)
             sendPropertyUpdate(card.p('id'), 'deck', null);
           removeWidgetLocal(previousState.id);
         } else {
           for(const key in previousState)
             if(widget[key] === undefined)
               widget[key] = null;
         }
         addWidgetLocal(widget);

         for(const child of children)
           sendPropertyUpdate(child.p('id'), 'parent', widget.id);
         for(const card of cards)
           sendPropertyUpdate(card.p('id'), 'deck', widget.id);

         showOverlay();
      }
  },
  template: `
    <button id="updateWidget" @click="update()">Update widget</button>
    <button id="duplicateWidget">Duplicate widget</button>
    <button id="removeWidget">Remove widget</button>
    <button id="manualEdit">Advanced: manually edit JSON (changes above will be discarded)</button>
  `
}