class FeedbackButton extends ToolbarButton {
  constructor() {
    super('feedback', 'Feedback', 'Send feedback, suggestions or bug reports to the developers.');
  }

  click() {
    $('#feedbackButton').click();
  }
}
