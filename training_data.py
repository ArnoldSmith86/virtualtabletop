training_data = [
    {
        "text": "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nCreate a simple button with the text 'Click Me'.<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n{\"myButton\": {\"type\": \"button\", \"text\": \"Click Me\"}}<|eot_id|>",
        "source": "internal_docs"
    },
    {
        "text": "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nCreate a label with the text 'Hello, World!'.<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n{\"myLabel\": {\"type\": \"label\", \"text\": \"Hello, World!\"}}<|eot_id|>",
        "source": "internal_docs"
    },
    {
        "text": "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nDisplay an image from the path '/assets/image.png'.<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n{\"myImage\": {\"type\": \"imagewidget\", \"image\": \"/assets/image.png\"}}<|eot_id|>",
        "source": "internal_docs"
    },
    {
        "text": "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nCreate a basic widget with two faces.<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n{\"myBasicWidget\": {\"type\": \"basicwidget\", \"faces\": [{\"text\": \"Face 1\"}, {\"text\": \"Face 2\"}]}}<|eot_id|>",
        "source": "internal_docs"
    },
    {
        "text": "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nCreate a 200x200 canvas with a resolution of 50.<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n{\"myCanvas\": {\"type\": \"canvas\", \"width\": 200, \"height\": 200, \"resolution\": 50}}<|eot_id|>",
        "source": "internal_docs"
    },
    {
        "text": "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nCreate a card of type 'monster' from the 'monsterDeck'.<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n{\"myCard\": {\"type\": \"card\", \"deck\": \"monsterDeck\", \"cardType\": \"monster\"}}<|eot_id|>",
        "source": "internal_docs"
    },
    {
        "text": "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nCreate a deck of cards with two card types: 'player' and 'enemy'.<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n{\"myDeck\": {\"type\": \"deck\", \"cardTypes\": {\"player\": {\"image\": \"/assets/player.png\"}, \"enemy\": {\"image\": \"/assets/enemy.png\"}}}}<|eot_id|>",
        "source": "internal_docs"
    },
    {
        "text": "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nCreate a standard six-sided die.<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n{\"myDie\": {\"type\": \"dice\", \"faces\":[1,2,3,4,5,6]}}<|eot_id|>",
        "source": "internal_docs"
    },
    {
        "text": "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nCreate a holder that accepts cards.<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n{\"myHolder\": {\"type\": \"holder\", \"dropTarget\": {\"type\": \"card\"}}}<|eot_id|>",
        "source": "internal_docs"
    },
    {
        "text": "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nCreate a pile of cards.<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n{\"myPile\": {\"type\": \"pile\"}}<|eot_id|>",
        "source": "internal_docs"
    },
    {
        "text": "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nCreate a scoreboard for two players.<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n{\"myScoreboard\": {\"type\": \"scoreboard\", \"players\": [\"Player 1\", \"Player 2\"]}}<|eot_id|>",
        "source": "internal_docs"
    },
    {
        "text": "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nCreate a player seat.<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n{\"mySeat\": {\"type\": \"seat\"}}<|eot_id|>",
        "source": "internal_docs"
    },
    {
        "text": "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nCreate a spinner with three options.<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n{\"mySpinner\": {\"type\": \"spinner\", \"options\": [\"Option 1\", \"Option 2\", \"Option 3\"]}}<|eot_id|>",
        "source": "internal_docs"
    },
    {
        "text": "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nCreate a 60-second timer.<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n{\"myTimer\": {\"type\": \"timer\", \"seconds\": 60}}<|eot_id|>",
        "source": "internal_docs"
    },
    {
        "text": "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nCreate a button that changes a label's text to 'Button Clicked!' when clicked.<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n{\"myButton\": {\"type\": \"button\", \"text\": \"Click Me\", \"clickRoutine\": [{\"func\": \"LABEL\", \"label\": \"myLabel\", \"value\": \"Button Clicked!\"}]}, \"myLabel\": {\"type\": \"label\", \"text\": \"Initial Text\"}}<|eot_id|>",
        "source": "internal_docs"
    },
    {
        "text": "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nCreate a button that rolls a die and updates one of six labels based on the result.<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n{\"myButton\": {\"type\": \"button\", \"text\": \"Roll Die\", \"clickRoutine\": [{\"func\": \"CLICK\", \"collection\": [\"myDie\"]}, {\"func\": \"GET\", \"collection\": [\"myDie\"], \"property\": \"activeFace\", \"variable\": \"dieResult\"}, {\"func\": \"IF\", \"operand1\": \"${dieResult}\", \"operand2\": 0, \"thenRoutine\": [{\"func\": \"LABEL\", \"label\": \"label1\", \"value\": \"Rolled a 1!\"}]}, {\"func\": \"IF\", \"operand1\": \"${dieResult}\", \"operand2\": 1, \"thenRoutine\": [{\"func\": \"LABEL\", \"label\": \"label2\", \"value\": \"Rolled a 2!\"}]}, {\"func\": \"IF\", \"operand1\": \"${dieResult}\", \"operand2\": 2, \"thenRoutine\": [{\"func\": \"LABEL\", \"label\": \"label3\", \"value\": \"Rolled a 3!\"}]}, {\"func\": \"IF\", \"operand1\": \"${dieResult}\", \"operand2\": 3, \"thenRoutine\": [{\"func\": \"LABEL\", \"label\": \"label4\", \"value\": \"Rolled a 4!\"}]}, {\"func\": \"IF\", \"operand1\": \"${dieResult}\", \"operand2\": 4, \"thenRoutine\": [{\"func\": \"LABEL\", \"label\": \"label5\", \"value\": \"Rolled a 5!\"}]}, {\"func\": \"IF\", \"operand1\": \"${dieResult}\", \"operand2\": 5, \"thenRoutine\": [{\"func\": \"LABEL\", \"label\": \"label6\", \"value\": \"Rolled a 6!\"}]}]}, \"myDie\": {\"type\": \"dice\"}, \"label1\": {\"type\": \"label\", \"text\": \"\"}, \"label2\": {\"type\": \"label\", \"text\": \"\"}, \"label3\": {\"type\": \"label\", \"text\": \"\"}, \"label4\": {\"type\": \"label\", \"text\": \"\"}, \"label5\": {\"type\": \"label\", \"text\": \"\"}, \"label6\": {\"type\": \"label\", \"text\": \"\"}}<|eot_id|>",
        "source": "internal_docs"
    },
    {
        "text": "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are a helpful assistant.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nCreate a blue button and a second button that inherits the first button's color.<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n{\"blueButton\": {\"type\": \"button\", \"color\": \"blue\"}, \"inheritingButton\": {\"type\": \"button\", \"inheritFrom\": {\"blueButton\": [\"color\"]}}}<|eot_id|>",
        "source": "internal_docs"
    },
]
