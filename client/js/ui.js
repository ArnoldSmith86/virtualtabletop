// Dom7
var $UI = Dom7;

// Theme
// var theme = 'auto';
var theme = 'md';
if (document.location.search.indexOf('theme=') >= 0) {
  theme = document.location.search.split('theme=')[1].split('&')[0];
}

// Init App

var routes = [
  // Index page
  {
    path: '/',
    pageName: 'home',
  },
  {
    path: '/statesOverlay/',
    pageName: 'home',
  },
  {
    path: '/stateEditOverlay/',
    pageName: 'stateEditOverlay',
  },
];


var app = new Framework7({
  id: 'io.virtualtabletop.ui',
  el: '#app',
  theme,
  routes: routes,
  autoDarkTheme: false,
  popup: {
    closeOnEscape: true,
  },
  sheet: {
    closeOnEscape: true,
  },
  popover: {
    closeOnEscape: true,
  },
  actions: {
    closeOnEscape: true,
  },
  vi: {
    placementId: 'pltd4o7ibb9rc653x14',
  },
});

var mainView = app.views.create('.view-main', {
  url: '/',
  stackPages: true,
  ignoreCache: true,
});

var editpopup = app.popup.create({
  el: '.editVariant',
})

$UI('#app').hide();

$UI('#app .hideApp').on('click', function() {
     $UI('#app').hide();
});



