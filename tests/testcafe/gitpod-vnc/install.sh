#!/bin/bash
sudo apt update
sudo apt install -y xvfb x11vnc xterm openjfx libopenjfx-java openbox firefox

sudo sed -ri "s/<number>4<\/number>/<number>1<\/number>/" /etc/xdg/openbox/rc.xml

if [ ! -d /opt/novnc ]
then
  sudo git clone --depth 1 https://github.com/novnc/noVNC.git /opt/novnc \
    && sudo git clone --depth 1 https://github.com/novnc/websockify /opt/novnc/utils/websockify
  sudo cp tests/testcafe/gitpod-vnc/novnc-index.html /opt/novnc/index.html
  sudo cp tests/testcafe/gitpod-vnc/start-vnc-session.sh /usr/bin/
  sudo chmod +x /usr/bin/start-vnc-session.sh
fi

if [ ! -d ~/.bashrc.d ]
then
  mkdir ~/.bashrc.d
  chmod 700 ~/.bashrc.d
  echo "for file in ~/.bashrc.d/*.bashrc;" >> ~/.bashrc
  echo "do" >> ~/.bashrc
  echo "source '$file'" >> ~/.bashrc
  echo "done" >> ~/.bashrc
fi

if [ ! -f ~/.bashrc.d/300-vnc ]
then
  echo "export DISPLAY=:0" >> ~/.bashrc.d/300-vnc
  echo "[ ! -e /tmp/X0-lock ] && (/usr/bin/start-vnc-session.sh &> /tmp/display-\${DISPLAY}.log)" >> ~/.bashrc.d/300-vnc
fi

. ~/.bashrc.d/300-vnc
