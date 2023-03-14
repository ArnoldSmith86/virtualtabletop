class AlignToLeftButton extends ToolbarButton {
  constructor(icon, tooltip, hotkey) {
    super(icon || 'align_horizontal_left', tooltip || 'Align the selected widgets to the left.', hotkey !== undefined ? hotkey : 'ArrowLeft');
  }

  async align(property, lowerBound, upperBound, factor) {
    const rects = selectedWidgets.map(w=>w.domElement.getBoundingClientRect());
    const target = Math.min(...rects.map(r=>r[lowerBound])) + (Math.max(...rects.map(r=>r[upperBound])) - Math.min(...rects.map(r=>r[lowerBound]))) * factor;
    for(const widget of selectedWidgets) {
      const r = widget.domElement.getBoundingClientRect();
      await widget.set(property, Math.round(widget.get(property) - (r[lowerBound]+(r[upperBound] - r[lowerBound]) * factor - target)/getScale()));
    }
  }

  click() {
    this.align('x', 'left', 'right', 0);
  }
}

class AlignToCenterButton extends AlignToLeftButton {
  constructor() {
    super('align_horizontal_center', 'Align the selected widgets to the center.', false);
  }

  click() {
    this.align('x', 'left', 'right', 0.5);
  }
}

class AlignToRightButton extends AlignToLeftButton {
  constructor() {
    super('align_horizontal_right', 'Align the selected widgets to the right.', 'ArrowRight');
  }

  click() {
    this.align('x', 'left', 'right', 1);
  }
}

class AlignToTopButton extends AlignToLeftButton {
  constructor() {
    super('align_vertical_top', 'Align the selected widgets to the top.', 'ArrowUp');
  }

  click() {
    this.align('y', 'top', 'bottom', 0);
  }
}

class AlignToMiddleButton extends AlignToLeftButton {
  constructor() {
    super('align_vertical_center', 'Align the selected widgets to the middle.', false);
  }

  click() {
    this.align('y', 'top', 'bottom', 0.5);
  }
}

class AlignToBottomButton extends AlignToLeftButton {
  constructor() {
    super('align_vertical_bottom', 'Align the selected widgets to the bottom.', 'ArrowDown');
  }

  click() {
    this.align('y', 'top', 'bottom', 1);
  }
}

// auto_awesome_motion for z correction
