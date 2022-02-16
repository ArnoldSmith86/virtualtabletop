#!/bin/bash
sudo apt update
sudo apt install -y xvfb x11vnc xterm openjfx libopenjfx-java openbox firefox

sudo sed -ri "s/<number>4<\/number>/<number>1<\/number>" /etc/xdg/openbox/rc.xml

sudo git clone --depth 1 https://github.com/novnc/noVNC.git /opt/novnc \
  && sudo git clone --depth 1 https://github.com/novnc/websockify /opt/novnc/utils/websockify
sudo cp /workspace/virtualtabletop/tests/testcafe/gitpod-vnc/novnc-index.html /opt/novnc/index.html

sudo cp /workspace/virtualtabletop/tests/testcafe/gitpod-vnc/start-vnc-session.sh /usr/bin/
sudo chmod +x /usr/bin/start-vnc-session.sh

echo "export DISPLAY=:0" >> /home/gitpod/.bashrc.d/300-vnc
echo "[ ! -e /tmp/X0-lock ] && (/usr/bin/start-vnc-session.sh &> /tmp/display-\&{DISPLAY}.log)" >> /home/gitpod/.bashrc.d/300-vnc
