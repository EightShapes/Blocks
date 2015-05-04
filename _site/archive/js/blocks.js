/*
 * jQuery BBQ: Back Button & Query Library - v1.2.1 - 2/17/2010
 * http://benalman.com/projects/jquery-bbq-plugin/
 *
 * Copyright (c) 2010 "Cowboy" Ben Alman
 * Dual licensed under the MIT and GPL licenses.
 * http://benalman.com/about/license/
 */
(function($,p){var i,m=Array.prototype.slice,r=decodeURIComponent,a=$.param,c,l,v,b=$.bbq=$.bbq||{},q,u,j,e=$.event.special,d="hashchange",A="querystring",D="fragment",y="elemUrlAttr",g="location",k="href",t="src",x=/^.*\?|#.*$/g,w=/^.*\#/,h,C={};function E(F){return typeof F==="string"}function B(G){var F=m.call(arguments,1);return function(){return G.apply(this,F.concat(m.call(arguments)))}}function n(F){return F.replace(/^[^#]*#?(.*)$/,"$1")}function o(F){return F.replace(/(?:^[^?#]*\?([^#]*).*$)?.*/,"$1")}function f(H,M,F,I,G){var O,L,K,N,J;if(I!==i){K=F.match(H?/^([^#]*)\#?(.*)$/:/^([^#?]*)\??([^#]*)(#?.*)/);J=K[3]||"";if(G===2&&E(I)){L=I.replace(H?w:x,"")}else{N=l(K[2]);I=E(I)?l[H?D:A](I):I;L=G===2?I:G===1?$.extend({},I,N):$.extend({},N,I);L=a(L);if(H){L=L.replace(h,r)}}O=K[1]+(H?"#":L||!K[1]?"?":"")+L+J}else{O=M(F!==i?F:p[g][k])}return O}a[A]=B(f,0,o);a[D]=c=B(f,1,n);c.noEscape=function(G){G=G||"";var F=$.map(G.split(""),encodeURIComponent);h=new RegExp(F.join("|"),"g")};c.noEscape(",/");$.deparam=l=function(I,F){var H={},G={"true":!0,"false":!1,"null":null};$.each(I.replace(/\+/g," ").split("&"),function(L,Q){var K=Q.split("="),P=r(K[0]),J,O=H,M=0,R=P.split("]["),N=R.length-1;if(/\[/.test(R[0])&&/\]$/.test(R[N])){R[N]=R[N].replace(/\]$/,"");R=R.shift().split("[").concat(R);N=R.length-1}else{N=0}if(K.length===2){J=r(K[1]);if(F){J=J&&!isNaN(J)?+J:J==="undefined"?i:G[J]!==i?G[J]:J}if(N){for(;M<=N;M++){P=R[M]===""?O.length:R[M];O=O[P]=M<N?O[P]||(R[M+1]&&isNaN(R[M+1])?{}:[]):J}}else{if($.isArray(H[P])){H[P].push(J)}else{if(H[P]!==i){H[P]=[H[P],J]}else{H[P]=J}}}}else{if(P){H[P]=F?i:""}}});return H};function z(H,F,G){if(F===i||typeof F==="boolean"){G=F;F=a[H?D:A]()}else{F=E(F)?F.replace(H?w:x,""):F}return l(F,G)}l[A]=B(z,0);l[D]=v=B(z,1);$[y]||($[y]=function(F){return $.extend(C,F)})({a:k,base:k,iframe:t,img:t,input:t,form:"action",link:k,script:t});j=$[y];function s(I,G,H,F){if(!E(H)&&typeof H!=="object"){F=H;H=G;G=i}return this.each(function(){var L=$(this),J=G||j()[(this.nodeName||"").toLowerCase()]||"",K=J&&L.attr(J)||"";L.attr(J,a[I](K,H,F))})}$.fn[A]=B(s,A);$.fn[D]=B(s,D);b.pushState=q=function(I,F){if(E(I)&&/^#/.test(I)&&F===i){F=2}var H=I!==i,G=c(p[g][k],H?I:{},H?F:2);p[g][k]=G+(/#/.test(G)?"":"#")};b.getState=u=function(F,G){return F===i||typeof F==="boolean"?v(F):v(G)[F]};b.removeState=function(F){var G={};if(F!==i){G=u();$.each($.isArray(F)?F:arguments,function(I,H){delete G[H]})}q(G,2)};e[d]=$.extend(e[d],{add:function(F){var H;function G(J){var I=J[D]=c();J.getState=function(K,L){return K===i||typeof K==="boolean"?l(I,K):l(I,L)[K]};H.apply(this,arguments)}if($.isFunction(F)){H=F;return G}else{H=F.handler;F.handler=G}}})})(jQuery,this);
/*
 * jQuery hashchange event - v1.2 - 2/11/2010
 * http://benalman.com/projects/jquery-hashchange-plugin/
 *
 * Copyright (c) 2010 "Cowboy" Ben Alman
 * Dual licensed under the MIT and GPL licenses.
 * http://benalman.com/about/license/
 */
(function($,i,b){var j,k=$.event.special,c="location",d="hashchange",l="href",f=$.browser,g=document.documentMode,h=f.msie&&(g===b||g<8),e="on"+d in i&&!h;function a(m){m=m||i[c][l];return m.replace(/^[^#]*#?(.*)$/,"$1")}$[d+"Delay"]=100;k[d]=$.extend(k[d],{setup:function(){if(e){return false}$(j.start)},teardown:function(){if(e){return false}$(j.stop)}});j=(function(){var m={},r,n,o,q;function p(){o=q=function(s){return s};if(h){n=$('<iframe src="javascript:0"/>').hide().insertAfter("body")[0].contentWindow;q=function(){return a(n.document[c][l])};o=function(u,s){if(u!==s){var t=n.document;t.open().close();t[c].hash="#"+u}};o(a())}}m.start=function(){if(r){return}var t=a();o||p();(function s(){var v=a(),u=q(t);if(v!==t){o(t=v,u);$(i).trigger(d)}else{if(u!==t){i[c][l]=i[c][l].replace(/#.*/,"")+"#"+u}}r=setTimeout(s,$[d+"Delay"])})()};m.stop=function(){if(!n){r&&clearTimeout(r);r=0}};return m})()})(jQuery,this);


/*!
 * EightShapes Blocks framework
 * http://eightshapes.com
 *
 * ©Copyright 2012 Eight Shapes LLC
 *
 * Version 2.0 September 21, 2012
 *
 * Terms of Use: http://unify.eightshapes.com/about-the-system/terms-of-use/
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

var EightShapes = EightShapes || {};
EightShapes.Blocks = {

  //======================================================================================================
  // Default Blocks Collections

  display : {
    // Show toolbar at all in the initial layout? Values: on, off
    toolbar : "on",
    // Set toolbar location? Values: topleft, topright, bottomleft, bottomright
    toolbarlocation : "topright",
    // Show markers button (and thus, markers overlaid in page layouts)? Values: on, off
    markers : "on",
    // Enable component interactions like remove, previous/next, and more?
    markeractions: true,
    // In addition to component name, also reveal library's/spec's ID number? Values: on, off
    ids : "off",
    // (pending idea) Does a related library exist? (and thus, expand Blocks views for accessing library assets)
    library : false,
		// Display component and variation ids when they exist?
		componentids: "off",
		// Extension used for the component file names
		componentextension: "html",
		// (what does "projects" below actually do?)
    projects : true,
    // Does a prototype Blocks homepage exist, and if so, default to it?
    homepage : false,
		homelinks : "notes",
		startpage : "page",
    // Default sizing for Grid items
    aspectratio : 1,
    galleryscale : 0.275,
    // Default component container
    componentcontainer : "",
    // Default page viewed when you exit full screen
    lastView : "page", // or "pages","components","page","component"
    lastViewID : "",
		currentDisplayMode: "grid",
		responsiveviewer : "off"
  },

  p : {},              // Pages
  c : {},              // Components
  s : {},              // Sets
	home : {
		load : function() {
      $.ajax({
				type: 'GET',
				url: "index.html",
				dataType: 'html',
				success: function(results) {
	        EightShapes.Blocks.home.loaded = true;
	        results = "<div>" + results + "</div>";
	        $('#esb > section.home').append($(results).children('section.home').children())
					EightShapes.Blocks.home.wrap();
				}	// end success
      }); // end ajax
		},
		wrap : function() {
			$('#esb > section.home')
				.wrapInner(document.createElement("aside"))
				.wrapInner(document.createElement("article"));
			$('#esb > section.home > article > aside').addClass('notes');
		},
		loaded : false
	},					// Home Page
  m : 0,              // Marker Count (enumerated to relate marked components in layouts and ASIDE.notes lists)
  pc : 0,             // Page Count (enumerated because...I don't remember)
  metadata : {},      // Prototype Metadata (eventually, author, last updated, version, etc)

  init : function() {

    // Summary: Initializes the Blocks framework and current page layout
    // Called by: document.ready
    // Precondition: a page to display that may or may not contain embedded or linked components
    // Core steps include:
    //  1. Expand CSS and HTML DOM (Add style sheets, build out DOM above and around the initial page)
    //  2. Load prototype configuration (to inventory all parts: settings, pages, components, etc)
    //  3. Register (into JS Object) and create stubs (in DOM) for all prototype parts
    //  4. Load and mark all embedded and linked components in initial page
    //
    // Initialization ends with a fully loaded and marked page in view.
    // Initialization does NOT load remaining pages, components, etc, which instead load upon exiting full screen.

    // Add Additional Style Sheets to Header
    $('head').prepend('<link rel="stylesheet" href="blocks/css/blocks.css"></link>');
    // $('head').append('<link rel="stylesheet" href="blocks/css/ui-lightness/jquery-ui-1.8.6.custom.css" />');

    // Error Check Markup and Setup Overall DOM
		if ($.bbq.getState( "toolbar" )) {
			EightShapes.Blocks.display.toolbar = $.bbq.getState( "toolbar" );
		}
    if (!EightShapes.Blocks.markupCore()) return false;

    // Identify and ID Current Page's Article
    var hrefsplit = window.location.href.split('/');
    EightShapes.Blocks.metadata.currentpageid = hrefsplit[hrefsplit.length-1].split('.html')[0];
		EightShapes.Blocks.display.lastViewID = EightShapes.Blocks.metadata.currentpageid;

    // Reset hash upon page refresh, since it may contain irrelevant hash values
		if (top == self) {
			if (EightShapes.Blocks.display.startpage === "page") {
      	$.bbq.pushState({view:"fullscreen", id:EightShapes.Blocks.metadata.currentpageid});
      	$('#esb > section.pages > article').attr('data-id',EightShapes.Blocks.metadata.currentpageid);
      	EightShapes.Blocks.registerPage($('#esb > section.pages > article.active'));
			} else {
      	$.bbq.pushState({view:"reloadhome", id:""});
      	$.bbq.pushState({view:"home", id:""});
			}
		} else {
			$('body > header, body > menu').remove();
		}


    // Attempt to Load _config.xml
    //   If successful -> invoke Blocks
    //   If failure -> remove Toolbar, still try to load page components into "standalone page"
    $.ajax({
      type: 'GET',
      url: '_config.xml?random='+Math.random(),  // random number added for cache busting
      dataType: 'xml',
      success: function(XMLconfig) {
        // Configure experience based on project-specific preferences
        EightShapes.Blocks.setDisplayPreferences(XMLconfig);
        EightShapes.Blocks.setPrototypeMetadata(XMLconfig);

        // Register Pages, Components, and Sets from Config XML to EightShapes.Blocks.p,
        // EightShapes.Blocks.c, and EightShapes.Blocks.s
        EightShapes.Blocks.registerPage($(XMLconfig).find('pages > page'));
        EightShapes.Blocks.registerComponent($(XMLconfig).find('components > component'));
      },
      error: function() {
        console.log('WARNING: _config.xml was not found in your prototype root directory.')
      },
			complete: function() {
				var targetpage = $('#esb > section.pages > article.active');

 			 // Initialize Components List
				EightShapes.Blocks.registerComponentMarkers($(targetpage));
       // Mark Embedded Components in Current Page
        EightShapes.Blocks.markComponent($(targetpage).find('section.viewport *.component'));
        // Load and Add Linked Components in Current Page
        EightShapes.Blocks.addComponentsToBlock($(targetpage).find('section.viewport'));
			}
    });

    //======================================================================================================
    // Blocks Toolbar & Menu Events

    // Exit Full Screen
    $('#esb > menu').on('click','button.fullscreen', function() {
    	var currentid = $.bbq.getState( "id" );
			if($('#esb').hasClass('fullscreen')) {
				if((EightShapes.Blocks.pc === 1)) {
					$.bbq.pushState({view:"page", id:$('body > section.pages > article').attr('data-id')});
				} else {
		      $.bbq.pushState({ view : EightShapes.Blocks.display.lastView, id : EightShapes.Blocks.display.lastViewID });
					EightShapes.Blocks.display.lastViewID = currentid;
				}
			} else {
	      $.bbq.pushState({ view : "fullscreen", id : EightShapes.Blocks.display.lastViewID });
			}
			return false;
    });
    // Toggle Markers On/Off
    $('#esb > menu').on('click','button.markers', function() {
			$(this).toggleClass('active');
      ($('body').hasClass('markers')) ? $('body').removeClass('markers') : $('body').addClass('markers');
			if ($(this).hasClass('active')) {
				$('div.responsiveframe > iframe').contents().find('#esb').addClass('markers');
			} else {
				$('div.responsiveframe > iframe').contents().find('#esb').removeClass('markers');
			}
    });
    // Toggle Grid/Thumbnail/List view mode for Pages and Components
    $('#esb > section > menu').on('click','span.viewas > button', function() {

			// Get Selected Mode
			var displayMode = $(this).html().toLowerCase();

			// Set Display Preference (for memory when returning to view)
			EightShapes.Blocks.display.currentDisplayMode = displayMode;

      $(this).addClass('active').siblings().removeClass('active');
      $('#esb > section.active')
        .removeClass('list grid thumbnail notes map').attr('style','').addClass(displayMode)
        .children('article').attr('style','').children('section.viewport').attr('style','');

			// Size Components Correctly within it's Block
      $('#esb > section.components.active.grid > article > section.variation:nth-child(3)').each( function(i,element) {
        $(element).css('width',($(element).find('section.viewport').width()/2+10)+'px');
        $(element).css('height',($(element).find('section.viewport').height()/2+60)+'px');
        $(element).parent().css('height',($(element).find('section.viewport').height()/2+75)+'px');
      });
    });
		// Open / Close Device Menu
		$('#esb > section.pages > menu').on('click','div.dropdown > button.selectionCurrent', function(event) {
			var dropdownButton = $(this);
			var dropdownOptions = dropdownButton.next('ul');
			if (this) {
				if (dropdownButton.parent().hasClass('opened')) {
					dropdownOptions.hide();
					dropdownButton.parent().removeClass('opened');
				} else {
					$('#esb > section > menu > div.dropdown').removeClass('opened');
					$('#esb > section > menu > div.dropdown > ul').hide();
					dropdownOptions.show();
					dropdownOptions.parent().addClass('opened');
					dropdownOptions.parent().bind('mousedownoutside', function(event){
						dropdownOptions.next('ul').hide()
						dropdownOptions.parent().removeClass('opened');
					});
				}
			};
			event.stopPropagation();
		});
		// Make Device Menu Selection
		$('#esb > section.pages > menu').on('click','div.dropdown > ul > li', function(event) {
			$(this).parent().hide().parent().removeClass('opened').find('.selected').removeClass('selected');
			$(this).closest('div.dropdown').find('button.selectionCurrent').html($(this).html());
			if ($(this).closest('div.dropdown').hasClass('deviceprofiles')) {
				EightShapes.Blocks.setDeviceProfile($(this));
			} else if ($(this).closest('div.dropdown').hasClass('deviceorientation')) {
				EightShapes.Blocks.setDeviceOrientation($(this).html().toLowerCase());
			}
		});

    //======================================================================================================
    // Blocks Article By Article Events

    // Enter Full Screen for Page from Any Blocks View
    $(document).on('click','#esb > section.pages > article > header > button.fullscreen', function() {
      $.bbq.pushState({view:"fullscreen", id:$(this).closest('article').attr('data-id')});
    });
		// Capture any basic link from one prototype to another to prevent complete blocks reload
		$(document).on('click','#esb > section.pages > article > section.viewport a', function(event) {
			for (var page in EightShapes.Blocks.p) {
        if ($(this).attr('href') !== undefined && $(this).attr('href').length > 0) {
				  if ($(this).attr('href').split(".html")[0] === page) {
      		  $.bbq.pushState({view:"fullscreen", id:page});
					 EightShapes.Blocks.display.lastViewID = id;
					 return false;
				  }
        }
			}
		})
    // Grid/Thumbnail/List View: Click Page Title > Go To Page Notes
    $(document).on('click','#esb > section.pages > article > header > a', function(e) {
      $(this).blur();
			if(($.bbq.getState( "view" ) === "home") && (EightShapes.Blocks.display.homelinks === "fullscreen")) {
      	$.bbq.pushState({view:"fullscreen", id:$(this).closest('article').attr('data-id')});
			} else {
      	$.bbq.pushState({view:"page", id:$(this).closest('article').attr('data-id')});
			}
      e.stopPropagation();
      return false;
    });
    // Notes View: Component List Hovers
    $(document).on('mouseover','#esb > section.pages > article.page > aside.notes ul.componentlist li',function() {
      $(this).closest('article.page').find('.component[data-marker='+$(this).attr('data-marker')+']').addClass('highlight');
    });
    $(document).on('mouseout','#esb > section.pages > article.page > aside.notes ul.componentlist li', function() {
      $(this).closest('article.page').find('.component[data-marker='+$(this).attr('data-marker')+']').removeClass('highlight');
    });
    // Grid/Thumbnail/List View: Click Component Title > Go To Component Notes
    $(document).on('click','#esb > section.components > article > header > a', function(e) {
      $(this).blur();
      $.bbq.pushState({view:"component", id:$(this).closest('article').attr('data-id')});
      e.stopPropagation();
      return false;
    });
    // Go From Article (Page, Component) to Main Section (Pages, Components)
    $(document).on('click','#esb > section.active.selected > header > a, #esb > section.active.notes > header > a', function() {
      $('#esb > header > nav.primary > ul > li.' + $(this).children('h2').html().toLowerCase()).click();
    });
		$(document).on('click','#esb > section.notes > article > aside.notes > h3.collapsible', function() {
			$(this).toggleClass('collapsed');
		})
  },

  //======================================================================================================
  // Constructors

  Component : function(id) {
    this.id = id;
    this.source = "project";
    this.loadStarted = false;
    this.loaded = false;
    this.locationsToAddIt = [];
    this.type = "component";
    this.html = "";
    this.title = "";
    this.variationCount = 1;
		this.variations = {};
    this.hasNotes = false;
    this.notes = "";
    this.notesLoaded = false;
    this.registered = false;
    this.doneness = "";
    this.wrapper = "";
    this.wrapperClasses = "";
		this.description = "";
		this.classes = "";
    this.container = "";					// Customizable container for Components section Notes view, at component level (not variation)

    // Load the component (all variations) from a file
    this.load = function() {
      var component = EightShapes.Blocks.c[id];
      if (component.loadStarted) {
        return false;
      }
      component.loadStarted = true;

      $.ajax( {
	      type: 'GET',
	      url: EightShapes.Blocks.sourceURL(component.source)+id+"."+EightShapes.Blocks.display.componentextension,
        cache: false,
	      dataType: 'html',
	      success: function(results) {
	        results = "<div>" + results + "</div>";
	        component.header          = $(results).children('header').attr('id',id);
	        component.html            = $(results).children('#variations');
	        component.notes           = $(results).children('aside.notes').html();
	        component.title           = $(results).children('header').attr('title');
	        component.classes         = $(results).children('header').attr('class');
	        component.wrapper         = $(results).children('header').attr('wrapper');
	        component.wrapperClasses  = $(results).children('header').attr('wrapperclass');
	        component.container       = $(results).children('header').attr('data-container');
	        component.hasNotes        = ($(results).children('aside.notes').length > 0);
	        component.variationCount  = $(results).children('article#variations').children().length;

	        if (component.variationCount > 1 && !component.loaded) {
	          $('#esb > section.components > article[data-id="' + id + '"] > header > h2').append(' <span class="count">(' + component.variationCount + ')</span>');
	        }
	        EightShapes.Blocks.registerComponent(component.header);
	        if($('#esb > section.components > article[data-id="' + component.id + '"] > section.variation').length === 0) {

						// Define and Load Markup for each variation into Components section
	          $(component.html).children('section[data-variation]').each( function(index,element) {
	            var variationid = $(this).attr('data-variation');
	            var variationtitle = $(this).attr('title');

							EightShapes.Blocks.c[id].variations[variationid] = new EightShapes.Blocks.ComponentVariation(variationid);
							EightShapes.Blocks.c[id].variations[variationid].id = variationid;
							EightShapes.Blocks.c[id].variations[variationid].title = variationtitle;
							EightShapes.Blocks.c[id].variations[variationid].html = $(this).html();
							EightShapes.Blocks.c[id].variations[variationid].classes = $(this).attr('class');
							EightShapes.Blocks.c[id].variations[variationid].container = $(this).attr('data-container');

              // For wrapping variations within the Components section layouts
              // If there's a wrapper element (and, optionally, classes too),
              // then don't class the viewport
	            var nonWrapperViewportClasses = component.classes + ' ' + EightShapes.Blocks.c[id].variations[variationid].classes,
	                wrapperStart = '',
	                wrapperEnd = '';
              if(component.wrapper) {
                wrapperStart = '<' + component.wrapper+' class="' + nonWrapperViewportClasses + ' ' + component.wrapperClasses + '">';
                wrapperEnd = '</' + component.wrapper + '>';
                nonWrapperViewportClasses = '';
              }

	            $('#esb > section.components > article[data-id="' + id + '"]')

	              .append('<section class="variation ' + EightShapes.Blocks.containComponent(id,variationid) + '" data-id="' + variationid + '" ><header><h3>' + EightShapes.Blocks.displayTitle(variationid,variationtitle) + '</h3></header>' +
	                 '<section class="viewport ' + nonWrapperViewportClasses + '">' + wrapperStart + $(this).html() + wrapperEnd + '</section></section>')
	              .children('aside.notes').find('ul.variationlist').append('<li data-variationid="' + variationid + '">' + variationtitle + '</li>');
	          })
	        }

          // Load Component-Specific CSS
          if (!component.cssloaded) {
            // We do a HEAD request so that we only load present files
            var css_request,
              css_resource_uri = EightShapes.Blocks.sourceURL(component.source) + "css/" + id + ".css";

            css_request = $.ajax({
              type: 'HEAD',
              url: css_resource_uri,
              cache: false,
              success: function() {
                // Note: Content-Length isn't present when Blocks is loaded via file://
                // and responseText isn't present when Blocks is loaded via http://.
                if (css_request.getResponseHeader('Content-Length') > 0 ||
                    css_request.responseText.length > 0) {
                  $('head').append('<link rel="stylesheet" href="' + css_resource_uri + '" />');
                  component.cssloaded = true;
                } else {
                  console.log('CSS resource is empty: ' + css_resource_uri);
                }
              },
              error: function(data) {
               console.log('CSS resource is missing: ' + css_resource_uri);
              }
            });
          }

					// Determine if there are any data-component descendants inside
          // these components, otherwise load JS and clone 'em
					if ($('#esb > section.components > article[data-id="' + component.id + '"]').find('*[data-component]').length > 0) {
						EightShapes.Blocks.addComponentsToBlock($('#esb > section.components > article[data-id="' + component.id + '"]'));
					} else {
						EightShapes.Blocks.loadComponentJSandAddToLocations(component);
					}
				}
      });
    }
  },
  Page : function(id) {
    this.id = id;
    this.loaded = false;
		this.rawhtml = "";
    this.html = "";
    this.embeddedclasses = "";
		this.configclasses = "";
    this.design = "";
    this.type = "page";
    this.title = "[untitled]";
    this.doneness = "unknown";
    this.description = "";
		this.pagefilename = id;
    this.index = EightShapes.Blocks.pc++;

    // Load page from a file in the project root directory into EightShapes.Blocks and the section.pages>article

    this.load = function() {
      var page = EightShapes.Blocks.p[id];
      var pageArticle = $('body > section.pages > article[data-id="' + page.id + '"]').append('<section class="viewport"></section>');

      $.ajax({
				type: 'GET',
				url: page.pagefilename+".html",
        cache: false,
				dataType: 'html',
				success: function(results) {
					var targetpage = $('#esb > section.pages > article[data-id="' + page.id + '"]');
					page.rawhtml = results;
	        results = "<div>" + results + "</div>";
	        page.html = results;
	        page.design = $(results).children('section.viewport').children();
	        page.embeddedclasses = $(results).children('section.viewport').attr('class');
	        page.notes = $(results).children('aside.notes').children();
	        page.loaded = true;
	        $(targetpage).children('section.viewport')
	          .append($(page.design))
						.addClass(page.configclasses)
	          .addClass(page.embeddedclasses);
	        $(targetpage).children('aside.notes')
	          .append($(page.notes));

	 			 // Initialize Components List
					EightShapes.Blocks.registerComponentMarkers($(targetpage));

	        // Mark all components embedded in the loaded page classed with "component"
	        EightShapes.Blocks.markComponent($(targetpage).children('section.viewport').find('*.component'));

	        // Load all components into the page that contain data-component attribute
	        EightShapes.Blocks.addComponentsToBlock($(targetpage).children('section.viewport'));
				}	// end success

      }); // end ajax

    }; // end this.load
  },
	ComponentVariation : function(id) {
		this.id = id;
		this.title = "";
		this.container = "";
		this.classes = "";
		this.hasNotes = false;
	},

  //======================================================================================================
  // Markup & Modular Loading, Adding & Marking

  markupCore : function() {

    // Summary: Wraps markup of current page with the core DOM element structure, sets up some live events
    // Called by: init
    // Preconditions:
    //    A child of the BODY tag with a class="viewport", demarking the page layout
    //    An <aside class="notes"> tag - child of the BODY tag - can also be included
    //    The BODY tag should have no other children
    //

		// Add ESB ID to BODY tag
    $('body').attr('id','esb')

		// If Page Viewport, then Set Up Full Screen
		if ($('body > section.viewport').length === 1) {
			EightShapes.Blocks.display.startpage = "page";
      $('body')
				.addClass('fullscreen')
				.wrapInner('<section class="pages active" data-section="pages"><article class="page active currentpage"></article></section>');

		// If Home, then Setup Home Start Page
		} else if ($('body > section.home').length === 1) {
			EightShapes.Blocks.display.startpage = "home";
			EightShapes.Blocks.home.loaded = true;
			EightShapes.Blocks.home.wrap();
      $('body')
				.append('<section class="pages active" data-section="pages"></section>')
			$('body > section.home aside.notes').on('click','a', function(event) {
				EightShapes.Blocks.navigateAnchor(this);
				event.stopPropagation();
			});

		// Else Return Failed Load
		} else {
      alert('EightShapes Blocks will not function without one and only one <section class="viewport"> or <section class="home">.');
      return false;
		}

		// Header
    $('body').prepend('<header><nav class="primary"><ul></ul></nav></header>');
    $('body > header > nav > ul')
      .append('<li class="pages" data-view="pages"><a href="#nowhere">Pages</a></li>')
      .append('<li class="components" data-view="components"><a href="#nowhere">Components</a></li>');
    $('body > header > nav.primary > ul > li a').live('click', function(e) {
      $(this).blur();
      $.bbq.pushState({view:$(this).parent().attr("data-view"),id:"n/a"});
      e.stopPropagation();
      return false;
    });

		// Components
    $('body').append('<section class="components" data-section="components"></section>');

    // Menu Toolbar
		if (EightShapes.Blocks.display.toolbar === "on") {
			$('#esb > header').after('<menu class="toolbar"><form action="#"></form></menu>');
			$('#esb > menu > form')
				.append('<fieldset class="basic"><button class="fullscreen">Full Screen</button><button class="markers">Markers</button></fieldset><fieldset class="pagination"><button class="previous">Previous Page</button><button class="next">Next Page</button></fieldset>')
				.append('<fieldset class="lists"><button data-menu="lists-scale" class="lists-scale setting">Scale</button><button data-menu="lists-height" class="lists-height setting">Height</button><button data-menu="viewas" class="viewas setting">View As</button></fieldset>')
			$('#esb > menu fieldset.lists')
				.append('<menu class="setting lists-scale"><button data-value="0.2">Small</button><button data-value="0.275" class="active">Medium</button><button data-value="0.35">Large</button></menu>')
				.append('<menu class="setting lists-height"><button data-value="0.5">Short</button><button data-value="1" class="active">Normal</button><button data-value="1.5">Tall</button><button data-value="2">Very Tall</button></menu>')
				.append('<menu class="setting viewas"><button data-value="grid" class="active">Grid</button><button data-value="thumbnail">Thumbnails</button><button data-value="list">List</button></menu>')
		}
		// Menu Toolbar: Toggle Menu Panels
    // Go From Article to Article
    $('#esb > menu').on('click','button.previous, button.next', function(event) {
      var currentPage = $('#esb > section.pages > article.page.active');
			var newPageID;
			if($(currentPage).prev().is('article') && $(this).hasClass('previous')) {
				newPageID = $(currentPage).prev().attr('data-id');
			} else if ($(this).hasClass('previous')){
				newPageID = $('#esb > section.pages > article').last().attr('data-id');
			} else if ($(currentPage).next().is('article')) {
				newPageID = $(currentPage).next().attr('data-id');
			} else {
				newPageID = $('#esb > section.pages > article').first().attr('data-id');
			}
      $.bbq.pushState({id:newPageID});
			return false;
    });
		$('#esb > menu').on('click','button.setting', function() {
			var toolbar = $(this).closest('menu.toolbar'),
					active = $(this).hasClass('active'),
					selectedMenu = $(this).attr('data-menu');

			$(toolbar).find('menu').removeClass('active');
			$(toolbar).find('button.setting').removeClass('active')
			if(!active) {
				$(this).addClass('active');
				$(toolbar).find('menu.'+selectedMenu).addClass('active');
			}
			return false;
		});
		$('#esb > menu').on('click','menu.setting > button', function() {
			var responsiveframes = $('article.page.active > section.responsiveframes > div.responsiveframe'),
					iframes = $(responsiveframes).children('iframe'),
					value = $(this).attr('data-value');

			if ($(this).hasClass('active')) {
				return false;
			} else {
				$(this).addClass('active').siblings().removeClass('active');
				if($(this).parent().hasClass('scale')) {
					$(responsiveframes).each( function() {
						$(this).css('width',$(this).attr('data-width') * value)
						$(this).css('-moz-transform','scale(' + value + ')')
						$(this).css('-webkit-transform','scale(' + value + ')')
					})
				} else if($(this).parent().hasClass('height')) {
					if (value > 0) {
						$(iframes).each( function() {
							$(this).attr('height',value);
						})
					} else {
						$(iframes).each( function() {
							$(this).attr('height',$(this).attr('data-original-height'));
						})
					}
				} else if($(this).parent().hasClass('viewas')) {
					EightShapes.Blocks.clearGridScale();
					$('#esb section.pages').removeClass('grid list thumbnail').addClass(value);
					if (value === "grid") {
						EightShapes.Blocks.setGridScale();
						$('#esb > menu fieldset.lists').addClass('grid');
					} else {
						$('#esb > menu fieldset.lists').removeClass('grid');
					}
				} else if($(this).parent().hasClass('lists-scale')) {
					EightShapes.Blocks.display.galleryscale = value;
					EightShapes.Blocks.setGridScale();
				} else if($(this).parent().hasClass('lists-height')) {
					EightShapes.Blocks.display.aspectratio = value;
					EightShapes.Blocks.setGridScale();
				}
			}
			return false;
		})

		// Menu Toolbar: Responsive Viewer
		$('#esb > menu > form')
			.append('<fieldset class="responsive"><button data-menu="scale" class="scale setting">Scale</button><button data-menu="height" class="height setting">Height</button></fieldset>');
		$('#esb > menu > form > fieldset.responsive')
       .prepend('<button title="iPad Landscape" data-height="768" data-width="1024" class="ipad landscape">iPad Landscape</button>')
       .prepend('<button title="iPad Portrait" data-height="1024" data-width="768" class="ipad portrait">iPad Portrait</button>')
       .prepend('<button title="Kindle Fire Landscape" data-height="600" data-width="1024" class="kindlefire landscape">Kindle Landscape</button>')
       .prepend('<button title="Kindle Fire Portrait" data-height="1024" data-width="600" class="kindlefire portrait">Kindle Portrait</button>')
       .prepend('<button title="iPhone Landscape" data-height="320" data-width="480" class="iphone landscape">iPhone Landscape</button>')
			.prepend('<button title="iPhone Portrait" data-height="480" data-width="320" class="iphone portrait">iPhone Portrait</button>')
			.append('<menu class="setting scale"><button data-value="0.33">33%</button><button data-value="0.5">50%</button><button class="active" data-value="0.67">67%</button><button data-value="1">100%</button></menu>')
			.append('<menu class="setting height"><button data-value="original" class="active">Original</button><button data-value="1200">Fixed at 1200px</button></menu>');

		$('#esb > menu fieldset.responsive > button:not(.setting)').on('click', function() {
			var width = $(this).attr('data-width'),
					height = $(this).attr('data-height'),
					originalheight = height,
					fieldset = $(this).closest('fieldset.responsive'),
					article = $('#esb > section.pages > article.page.active'),
					scale = $(fieldset).find('menu.scale > button.active').attr('data-value'),
					title = width + "x" + height + $(this).html(),
					titlemarkup = width + "x" + height + " <i>" + $(this).html() + "</i>";
			var newiframe;

			if ($('#esb > menu menu.height > button.active').attr('data-value') > 0) {
				height = $('#esb > menu menu.height > button.active').attr('data-value');
			}

			$(this).toggleClass('active');
			if($(this).hasClass('active')) {
				if($(article).children('section.responsiveframes').length < 1) {
					$(article).append('<section class="responsiveframes"></section>');
				}
				$(article).children('section.responsiveframes')
					.append('<div class="responsiveframe" data-width="' + width + '" data-frame="' + title + '" style="width: ' + width*scale + 'px; -moz-transform: scale(' + scale + '); -webkit-transform: scale(' + scale + '); "><h2>' + titlemarkup + '</h2><iframe frameborder="0" width="' + width + '" height="' + height + '" data-original-height="' + originalheight + '" sandbox="allow-same-origin allow-forms allow-scripts" seamless></iframe></div>');

				// With iFrame now in DOM, take the loaded page within the page object and replace iFrame contents
				newiframe = $(article).find('iframe').last()[0].contentWindow;
				newiframe.document.open('text/html', 'replace');
				newiframe.document.write(EightShapes.Blocks.p[$(article).attr('data-id')].rawhtml);
				newiframe.document.close();
				setTimeout(function() {$('div.responsiveframe > iframe').contents().find('section.viewport').addClass(EightShapes.Blocks.p[$(article).attr('data-id')].configclasses);},500);
			} else {
				$(article).find('section.responsiveframes').children('.responsiveframe[data-frame="' + title + '"]').remove();
			}

			if ($(fieldset).children('button.active').length > 0) {
				$('#esb').addClass('responsiveviewer');
			} else {
				$('#esb').removeClass('responsiveviewer');
				$(article).children('section.responsiveframes').remove();
			}
			return false;
		})

    return true;
  },
  registerPage : function(elements,setid) {

    // Summary: Registers the current page and pages identified in Config XML into EightShapes.Blocks.p
    // Called by: init, registerSet
    // Parameters:
    //    elements: 1 (current page in DOM) or 0+ (from Config XML PAGES element)
    //    setid (optional): Used for registering page in a set in BODY>SECTION.sets>SECTION.set (future)
    //

    // Make the assumption that the active page article is the page loaded into the browser at page load
    var loadedPageID = $('#esb > section.pages > article.active').attr('data-id');

    // reachedLoadedPageYet : Used to order page <articles> in DOM to match sequence of config XML file
    var reachedLoadedPageYet = false;

    elements.each(function (i,element) {
      var currentArticle = "";
			var pagefilename = "";

			// Assign ID from id (config file) or data-id (if inline for default page assigned during markup core)
      var id = $(element).attr('id');
      if ($(element).attr('data-id')) {
        currentArticle = element;
        id = $(element).attr('data-id');
      }

			// Handle variations intended to load the same page multiple times
			pagefilename = id;
			if ($(element).attr('variation')) {
				id = id + "_" + $(element).attr('variation');
			}

      // ESB Page exist?
      if (!EightShapes.Blocks.p[id]) {
        EightShapes.Blocks.p[id] = new EightShapes.Blocks.Page(id);
      }

      if (id === loadedPageID) {
        reachedLoadedPageYet = true;
				EightShapes.Blocks.p[id].rawhtml = $('html').html();
      }

      // Update with Properties from Element Provided
			if ($(element).attr('variation')) {
				EightShapes.Blocks.p[id].pagefilename = pagefilename;
			}
      if ($(element).attr('doneness')) {
        EightShapes.Blocks.p[id].doneness = $(element).attr('doneness');
      }
      if ($(element).attr('description')) {
        EightShapes.Blocks.p[id].description = $(element).attr('description');
      }
      if ($(element).attr('title')) {
        EightShapes.Blocks.p[id].title = $(element).attr('title');
      }
			if ($(element).attr('class')) {
      	EightShapes.Blocks.p[id].configclasses = $(element).attr('class');
			}

      // ARTICLE Empty Components List
      var articleComponentsList = '<h3 class="collapsible">Components</h3><ul class="componentlist itemstack"></ul>';

      // Section > Article exist?
      if ($('#esb > section.pages > article[data-id="' + id + '"]').length === 0) {
        if (reachedLoadedPageYet || (EightShapes.Blocks.display.startpage === "home")) {
          $('#esb > section.pages').append('<article data-id="' + id + '" class="page"></article>');
        } else {
          $('#esb > section.pages > article.active').before('<article data-id="' + id + '" class="page"></article>');
        }
      }

      currentArticle = $('#esb > section.pages > article[data-id="' + id + '"]');
      if ($(element).attr('type')) {
        $(currentArticle).attr('data-pagetype',$(element).attr('type'));
        if(($(currentArticle).prev().attr('data-pagetype') === $(element).attr('type'))) {
          $(currentArticle).addClass('variation');
        }
      }

      // Section > Article > Header exist?
      if($(currentArticle).children('header').length === 0) {
        $(currentArticle).prepend('<header></header>');
      }
      $(currentArticle).children('header').html(EightShapes.Blocks.articleHeader(EightShapes.Blocks.p[id]));

      // Section > Article > Design exist?
      if($(currentArticle).children('section.viewport').length > 0) {
        EightShapes.Blocks.p[id].loaded = true;
      }

      // Section > Article > Aside.notes exist?
      if ($(currentArticle).children('aside.notes').length === 0) {
        $(currentArticle).children('header').after('<aside class="notes">' + articleComponentsList + '</aside>');
      } else if ($(currentArticle).children('aside.notes').children('ul.componentlist').length === 0) {
        $(currentArticle).children('aside.notes').prepend(articleComponentsList)
      }

			$(currentArticle).children('aside.notes').on('click','a', function(event) {
				EightShapes.Blocks.navigateAnchor(this);
				event.stopPropagation();
			})

      if(setid !== undefined) {
        if($(currentArticle).children('aside.notes').children('ul.appearsinlist').length === 0) {
          $(currentArticle).children('aside.notes').append('<h3>Appears In</h3><ul class="appearsinlist itemstack"></ul>');
        }
        $(currentArticle).children('aside.notes').children('ul.appearsinlist').append('<li>' + EightShapes.Blocks.s[setid].title + '</li>');
      }

    });
  },
  registerComponent : function(elements) {

    // Summary: Register a component found in XML>COMPONENTS, the default page, or a loaded page
    // Description: Will clarify essential component properties (such as title and source), create the object, and
    //    stub out the HEADER, ARTICLE, and ASIDE.notes within BODY>SECTION.components>ARTICLE
    // Parameter: 1+ elements within a page layout or found in XML

    elements.each(function (i,element) {
      var id;
      if($(element).attr('data-component')) {
        id = $(element).attr('data-component');
      } else {
        id = $(element).attr('id');
      }
      var articleStub = false;
      if (!EightShapes.Blocks.c[id]) {
        EightShapes.Blocks.c[id] = new EightShapes.Blocks.Component(id);
      }
      if ($(element).attr('data-source')) {
        EightShapes.Blocks.c[id].source =  $(element).attr('data-source');
      }
      if (($(element).attr('data-description')) && (EightShapes.Blocks.c[id].description === "")) {
        EightShapes.Blocks.c[id].description = $(element).attr('data-description');
      }
      if (($(element).attr('data-doneness')) && (EightShapes.Blocks.c[id].doneness === "")) {
        EightShapes.Blocks.c[id].doneness = $(element).attr('data-doneness');
      }
      if (($(element).attr('title')) && (EightShapes.Blocks.c[id].title === "")) {
        EightShapes.Blocks.c[id].title = $(element).attr('title');
      }

      // Article Header
      var articleHeader = '<header><button class="esb remove"></button><a href="#nowhere"><h2 class="' + EightShapes.Blocks.c[id].doneness + '">' + EightShapes.Blocks.displayTitle(id,EightShapes.Blocks.c[id].title) + '</h2></a><span class="description">' + EightShapes.Blocks.c[id].description + '</span></header>';

      // Article Notes Default
      var articleNotes = '<h3 class="collapsible">Variations</h3><ul class="variationlist itemstack"></ul>';
      // Append Notes from Component File
      if (EightShapes.Blocks.c[id].hasNotes) {
        articleNotes += EightShapes.Blocks.c[id].notes;
      }

      // Cycle through existing component ARTICLES to find the current element's ARTICLE and initialize aspects
      $('#esb > section.components > article').each(function (i,articleelement) {
        if($(articleelement).attr('data-id') === id) {
          articleStub = true;
          if($(articleelement).children('header').length === 0) {
            $(articleelement).prepend(articleHeader);
          }
          if($(articleelement).children('section.variation').length > 0) {
            EightShapes.Blocks.c[id].loaded = true;
          }
          if($(articleelement).children('aside.notes').length === 0){
            $(articleelement).append('<aside class="notes">' + articleNotes + '</aside>');
            return;
          }
          if ($(articleelement).children('aside.notes').children('ul.variationlist').length === 0) {
            $(articleelement).find('aside.notes').prepend(articleNotes);
            return;
          }
          if (EightShapes.Blocks.c[id].hasNotes && !EightShapes.Blocks.c[id].notesLoaded) {
            $(articleelement).find('aside.notes').append(EightShapes.Blocks.c[id].notes);
            EightShapes.Blocks.c[id].notesLoaded = true;
            return;
          }
          return;
        }
      });
      if (!articleStub) {
        $('#esb > section.components').append('<article data-id="' + id + '" class="component">' + articleHeader + '<aside class="notes">' + articleNotes + '</aside></article>');
        if(EightShapes.Blocks.c[id].hasNotes) {
          EightShapes.Blocks.c[id].notesLoaded = true;
        }
      }
      EightShapes.Blocks.c[id].registered = true;
    });
  },
	registerComponentMarkers : function(page) {
		$(page).find('*[data-component] , *.component').each( function() {
      var marker = EightShapes.Blocks.m++,
					componentid = "";
      if ($(this).attr('data-component')) {
        componentid = $(this).attr('data-component');
      }
			$(this).attr('data-marker', marker);
			$(page).find('aside.notes > ul.componentlist')
				.append('<li class="esbmarker" data-marker="' + marker + '" data-id="' + componentid + '"></li>');
		});
	},
  addComponentsToBlock : function(blockElement) {

    // Summary: Traverses a portion of a DOM and loads & adds all not-yet-loaded components
    // Description: If a component is already available (loaded), it's added immediately.
    //    Otherwise, the system will queue the component for loading, which once complete,
    //    will add it to the element(s) waiting for it
    // Parameter: blockElement, An existing DOM node already loaded

    $(blockElement).find('*[data-component]').each( function(i) {
      var id = $(this).attr('data-component');
      var $component = EightShapes.Blocks.c[id];
      if ($component && $component.loaded) {
				if ($(this).hasClass('loaded') === false) {
        	EightShapes.Blocks.addComponent(this);
				}
      } else {
        if (!$component) {
          EightShapes.Blocks.c[id] = new EightShapes.Blocks.Component(id);
					if ($(this).attr('data-source')) {
						EightShapes.Blocks.c[id].source = $(this).attr('data-source');
					}
          $component = EightShapes.Blocks.c[id];
        }
        $component.locationsToAddIt.push(this);
        $component.load();
      }
    });
  },
  addComponent : function(elements) {

    // Summary: Clone 1+ component variations from BODY>SECTION.components into a BODY>SECTION.pages>ARTICLE layout
    // Parameter: 1+ elements within BODY>SECTION.pages>ARTICLE layouts
    // Called by:
    //    addComponentsToBlock (for each component in a layout that's already known to be loaded)
    //    Component.load (for when a component load is triggered, to complete the circle and get it
    //                    – and other queued places to add that component - in their layout locations)

    $(elements).each(function(index,element) {
      var id = $(element).attr('data-component');
      var clonedComponent;
			var containingComponentArticle = false;
			var variationid = $(element).attr('data-variation');

      // Clone the Component
      // If component is wrapped, then cloned the children of the wrapper. Otherwise, cloned the direct children of the viewport.
      if (EightShapes.Blocks.c[id].wrapper) {
        if (variationid) {
          clonedComponent = $('#esb > section.components > article[data-id="' + id + '"]').find('section[data-id="' + $(element).attr('data-variation') + '"] > section.viewport').children().clone(true);
        } else {
  				variationid = $('#esb > section.components > article[data-id="' + id + '"]').find('section:nth-child(3)').attr('data-id');
          clonedComponent = $('#esb > section.components > article[data-id="' + id + '"]').find('section:nth-child(3) > section.viewport').children().clone(true);
        }
      } else {
        if (variationid) {
          clonedComponent = $('#esb > section.components > article[data-id="' + id + '"]').find('section[data-id="' + $(element).attr('data-variation') + '"] > section.viewport').clone(true);
        } else {
  				variationid = $('#esb > section.components > article[data-id="' + id + '"]').find('section:nth-child(3)').attr('data-id');
          clonedComponent = $('#esb > section.components > article[data-id="' + id + '"]').find('section:nth-child(3) > section.viewport').clone(true);
        }
      }

			// Remove descendent component markers and style
			$(clonedComponent).find('.component').removeClass('component').find('div.esbmarker-wrapper').remove();

      // Append Clone to Page Layout
      $(element).append($(clonedComponent).children())
				.addClass(EightShapes.Blocks.c[id].classes)														// Component class
				.addClass('loaded');																									// Designate as loaded

			if(EightShapes.Blocks.c[id].variations[variationid]) {
				$(element).addClass(EightShapes.Blocks.c[id].variations[variationid].classes) // Component variation class
			}

			// Check if its a decendant component
			containingComponentArticle = $(element).closest('#esb > section.components > article.component');
			if (containingComponentArticle && containingComponentArticle.length > 0) {

				// Check to see if any descendents still need to be loaded for the parent, and if not, finish the loading process for the parent
				if ($(containingComponentArticle).find('*[data-component]:not(.loaded)').length === 0) {
					EightShapes.Blocks.loadComponentJSandAddToLocations(EightShapes.Blocks.c[$(containingComponentArticle).attr('data-id')]);
				}
			}

      // Mark (single) Component that's just been added to one layout
      EightShapes.Blocks.markComponent(element);
    })
  },
  markComponent : function(componentElements) {

    // Summary: Mark a component in a page layout with the orange annotation marker and
    // outline & add it to the Notes list
    // Parameter: componentElements, a collection of 1+ components in a BODY>SECTION.pages>ARTICLE>section.viewport
    // Description: Marks the component with a label and also embeds relevant buttons (previous/next variation,
    //    show/hide, remove) and notations (notes available? variation id, etc)

    $(componentElements).each(function (i, element) {

      // Establish Variables (with defaults)
      var marker = $(element).attr('data-marker');
 				componentid = "",
        componentname = "[Untitled]",
        variationHTML = null,
        variationTitle = "Default",
				variationID = $(element).attr('data-variation');

			// Initialize Variables
			if (variationID === "undefined") {
				variationID = " ";
			}
      if ($(element).attr('data-component')) {
        componentid = $(element).attr('data-component');
      }
      if ($(element).attr('title')) {
        componentname = $(element).attr('title');
      } else if (EightShapes.Blocks.c[componentid]) {
        if (EightShapes.Blocks.c[componentid].title !== "") {
         	componentname = EightShapes.Blocks.c[componentid].title;
        }
      }
			if (EightShapes.Blocks.display.componentids === "on") {
				if (variationID) {
         	componentname = componentid + variationID + " " + componentname;
				} else {
         	componentname = componentid + " " + componentname;
				}
			}
      if (variationID) {
        variationHTML = $(EightShapes.Blocks.c[componentid].html)
                          .find('[data-variation='+$(element)
                          .attr('data-variation')+']');
        variationTitle = ($(variationHTML).attr('title')) ? $(variationHTML).attr('title') : $(variationHTML).attr('data-variation');
      }

      // Ensure Component has Component Class
      $(element).addClass('component');

      // Design
      if (EightShapes.Blocks.display.markers === "on") {
        $(element).prepend(' <div class="esbmarker-wrapper"><section class="esbmarker" data-marker="' + marker + '"><div><button class="esb remove"></button><button class="esb showhide"></button>' + componentname + '</div></section></div>');

        // Notes Icon within Design Marker
        if (EightShapes.Blocks.c[componentid] &&
            (EightShapes.Blocks.c[componentid].hasNotes ||
             EightShapes.Blocks.c[componentid].variationCount > 1)) {
          $(element).find('section.esbmarker > div:first-child').append('<button class="esb notes"></button>');
        }
				// Design: Toggle Component Hidden or Displayed
        $(element).find('section.esbmarker button.showhide').click( function(event) {
          EightShapes.Blocks.toggleComponentDisplay(event);
          event.stopPropagation();
        });
				// Design: Remove Component from Layout, Notes List
        $(element).find('section.esbmarker button.remove').click( function(event) {
          EightShapes.Blocks.removeComponent(event);
          event.stopPropagation();
        });
      }

      // Notes
			var noteElement = $(element).closest('article.page')
				.children('aside.notes')
				.find('ul.componentlist li[data-marker="' + marker + '"]')
				.append('<div>' + componentname + " (" + variationTitle + ')</div>');

			// Add Notes Marker Remove, Show & Hide
			if (EightShapes.Blocks.display.markeractions) {
				$(noteElement).find('div').prepend('<button class="esb remove"></button><button class="esb showhide"></button>')
			}
			// Add the Required/Recommended/Optional tag if present
			if ($(element).attr('data-requirement')) {
				$(noteElement).find('div').prepend('<span class="requirement">' + $(element).attr('data-requirement') + '</span>')
			}
			// If to be hidden by default, hide it
			if ($(element).attr('data-display') === "hidden") {
				$(noteElement).addClass('hidden');
				$(element).hide();
			}
			// Notes: Remove Component from Layout, Notes List
      $(noteElement).find('button.remove').click( function(event) {
        EightShapes.Blocks.removeComponent(event)
				event.stopPropagation();
      });
			// Notes: Toggle Component Hidden or Displayed
      $(noteElement).find('button.showhide').click( function(event) {
        EightShapes.Blocks.toggleComponentDisplay(event)
				event.stopPropagation();
      });
			// Notes: Navigate to Component
      $(noteElement).click( function(event) {
				console.log('go to component')
        if ($(this).attr('data-id') !== "") {
					$.bbq.pushState({view:"component", id:$(this).attr('data-id')});
        }
      });

			// If variations exist, add Previous & Next buttons.
      if (EightShapes.Blocks.c[componentid] &&
          (EightShapes.Blocks.c[componentid].variationCount > 1)) {

        $(noteElement)
          .find('button.showhide')
          .after('<button class="esb next"></button><button class="esb previous"></button>');

        $(noteElement).on('click','button.previous',function(event) {
          EightShapes.Blocks.previousComponent(event);
					event.stopPropagation();
        });

        $(noteElement).on('click','button.next',function(event) {
          EightShapes.Blocks.nextComponent(event)
					event.stopPropagation();
        });
      }

    });
  },
	loadComponentJSandAddToLocations : function(component) {
    $.ajax({
      type: 'GET',
      url: EightShapes.Blocks.sourceURL(component.source) + "js/" + component.id + ".js",
      cache: false,
      dataType: 'script',
			complete: function(data) {
        EightShapes.Blocks.addComponent(component.locationsToAddIt);
        component.loaded = true;
			}
    });
	},

  //======================================================================================================
  // Component Interactions

  toggleComponentDisplay : function(event) {

    // Summary: Toggles the visible display of a component element in BODY>SECTION.pages>ARTICLE>section.viewport

    event.stopPropagation();

    var marker = $(event.target).closest('.esbmarker[data-marker]').attr('data-marker');
    var notesItem = $('body').find('aside.notes li[data-marker='+marker+']');
    var designItem = $('body').find('section.viewport .component[data-marker='+marker+']');

    if ($(notesItem).hasClass('hidden')) {
      $(notesItem).removeClass('hidden');
      $(designItem).slideDown(1000);
    } else {
      $(notesItem).addClass('hidden');
      $(designItem).slideUp(1000);
    }
  },
  removeComponent : function(event) {

    // Summary: Removes a component element from a BODY>SECTION.pages>ARTICLE>section.viewport

    event.stopPropagation();
    var marker = $(event.target).closest('.esbmarker[data-marker]').attr('data-marker');
    var notesItem = $('body').find('aside.notes li[data-marker='+marker+']');
    var designItem = $('body').find('section.viewport .component[data-marker='+marker+']');

    $(notesItem).slideUp(500, function() { $(this).remove() });
    $(designItem).slideUp(1000, function() { $(this).remove() });
  },
  previousComponent : function(event) {

    // Summary: From a marker in the layout or Page Notes component list,
    // toggle between 2+ variations of a component

    var marker = $(event.target).closest('.esbmarker[data-marker]').attr('data-marker');
    var notesItem = $('body').find('aside.notes li[data-marker='+marker+']');
    var designItem = $('body').find('.component[data-marker='+marker+']');
    var componenthtml = $(EightShapes.Blocks.c[$(designItem).attr('data-component')].html);
    var variationid = $(designItem).attr('data-variation');

    var previousVariation;

		// Remove current variation from layout
    $(designItem).children('*:not(.esbmarker-wrapper)').remove();

		// Determine the previous variation to add to the layout
    if ($(componenthtml).find('*[data-variation='+variationid+']').index() > 0) {
      previousVariation = $(componenthtml).find('*[data-variation='+variationid+']').prev().clone();
    } else {
      previousVariation = $(componenthtml).children().parents("#variations").children(':last-child').clone();
    }

		// Add the variation to the layout
    $(designItem)
      .append($(previousVariation).children())
      .attr('data-variation',$(previousVariation).attr('data-variation'))
  },
  nextComponent : function(event) {

    // Summary: From a marker in the layout or Page Notes component list,
    // toggle between 2+ variations of a component
    // Status: Worked in previous versions, not currently functional

    var marker = $(event.target).closest('.esbmarker[data-marker]').attr('data-marker');
    var notesItem = $('body').find('aside.notes li[data-marker='+marker+']');
    var designItem = $('body').find('.component[data-marker='+marker+']');
    var componenthtml = $(EightShapes.Blocks.c[$(designItem).attr('data-component')].html);
    var variationid = $(designItem).attr('data-variation');

    var nextVariation;

		// Remove current variation from layout
    $(designItem).children('*:not(.esbmarker-wrapper)').remove();

		// Determine the previous variation to add to the layout
    if ($(componenthtml).find('*[data-variation='+variationid+']').index() < EightShapes.Blocks.c[$(designItem).attr('data-component')].variationCount - 1) {
      nextVariation = $(componenthtml).find('*[data-variation='+variationid+']').next().clone();
    } else {
      nextVariation = $(componenthtml).children().parents("#variations").children(':first-child').clone();
    }

		// Add the variation to the layout
    $(designItem)
      .append($(nextVariation).children())
      .attr('data-variation',$(nextVariation).attr('data-variation'))
  },

  //======================================================================================================
  // Utilities

  view : function() {

    // Summary: Flushes all view-controlling classes from top-level elements (BODY>SECTION, ARTICLES within, etc),
    //    then sets the appropriate class combinations to create the requested view. Also accounts for back button.

    var article;

    // Determine Current View
    var view = $.bbq.getState( "view" );
    var id = $.bbq.getState( "id" );

    // Discard links within prototype pages
    // (links containing a hash tag will tigger hashchange).
    // https://github.com/EightShapes/Blocks/issues/7

    if (view == undefined && id == undefined) {
      return false;
    }

    // Flush View Classes & Styling
    $('body').removeClass('fullscreen esb-home responsiveviewer');
    $('body > header > nav > ul > li').removeClass('active');
    $('body > section').removeClass('active notes grid list thumbnail').attr('style','');
    $('body > section > article').removeClass('active list thumbnail grid inlineflow').attr('style','').children('section.viewport').attr('style','');
		EightShapes.Blocks.clearGridScale();

		// Flush Menuing & Responsive Viewers
		$('body > menu fieldset.pagination').hide();
		$('body > menu fieldset.lists').hide();
		$('body > menu fieldset.responsive').hide().children('button').removeClass('active');
		$('body > section.pages > article > section.responsiveframes').remove();

    // Set View Classes for Current View
    switch (view) {
			case "home":
				$('body').addClass('esb-home');
				$('body > section.home').addClass('notes');
				$('body > section.pages').addClass('list');
				$('body > section.components').addClass('list');
        EightShapes.Blocks.display.lastView = "home";
        EightShapes.Blocks.display.lastViewID = "";
        if(!EightShapes.Blocks.home.loaded) {
          EightShapes.Blocks.home.load();
        }
				break;
      case "pages":
        $('body > header > nav > ul > li.pages').addClass('active');
				$('body > menu fieldset.lists').show();
				$('body > section.pages').addClass('active');
				$('body > section.pages').addClass(EightShapes.Blocks.display.currentDisplayMode);
        EightShapes.Blocks.display.lastView = "pages";
	      for(pageid in EightShapes.Blocks.p) {
	        if(!EightShapes.Blocks.p[pageid].loaded) {
	          EightShapes.Blocks.p[pageid].load();
	        }
	      }
				if (EightShapes.Blocks.display.currentDisplayMode === "grid") {
					EightShapes.Blocks.setGridScale();
					$('#esb > menu fieldset.lists').addClass('grid');
				} else {
					$('#esb > menu fieldset.lists').removeClass('grid');
				}
        break;
      case "page":
        $('body > header > nav > ul > li.pages').addClass('active');
				$('body > menu fieldset.pagination').show();
        $('body > section.pages').addClass('active notes');
        $('body > section.pages > article[data-id="' + id + '"]').addClass('active');
				if (EightShapes.Blocks.display.responsiveviewer === "on") {
					$('#esb > menu fieldset.responsive').show();
				}
        EightShapes.Blocks.display.lastView = "page";
        EightShapes.Blocks.display.lastViewID = id;
        if(!EightShapes.Blocks.p[id].loaded) {
          EightShapes.Blocks.p[id].load();
        }
        break;
      case "components":
        $('body > header > nav > ul > li.components').addClass('active');
        $('body > section.components').addClass('active grid');
        EightShapes.Blocks.display.lastView = "components";
        EightShapes.Blocks.display.lastViewID = "";
	      for(componentid in EightShapes.Blocks.c) {
	        if(!EightShapes.Blocks.c[componentid].loaded) {
	          EightShapes.Blocks.c[componentid].load();
	        }
	      }
        break;
      case "component":
        $('body > header > nav > ul > li.components').addClass('active');
        $('body > section.components').addClass('active notes')
        $('body > section.components > article[data-id="' + id + '"]').addClass('active')
          .children('section.variation').each( function(i,element) {
            $(element).css('width','').css('height','')
//            $(element).css('width',($(element).find('section.viewport').width()/1.25+10)+'px');
//            $(element).css('height',($(element).find('section.viewport').height()/1.25+60)+'px');
          });
        EightShapes.Blocks.display.lastView = "component";
        EightShapes.Blocks.display.lastViewID = id;
        if(!EightShapes.Blocks.c[id].loaded) {
          EightShapes.Blocks.c[id].load();
        }
        break;
      case "fullscreen":
        $('body').addClass('fullscreen');
 				$('body > menu fieldset.pagination').show();
      	$('body > section.pages').addClass('active');
        $('body > section.pages > article[data-id="' + id + '"]').addClass('active');
        EightShapes.Blocks.display.lastViewID = id;
        if(!EightShapes.Blocks.p[id].loaded) {
          EightShapes.Blocks.p[id].load();
        }
        break;
    }
  },
	navigateAnchor : function(anchor) {
		var dataview = $(anchor).attr('data-view'),
				dataid = $(anchor).attr('data-id');

		if (dataview && dataid) {
      $.bbq.pushState({ view : dataview, id : dataid });
		} else if (!dataview) {
			console.log('Your anchor tag has an ID, but lack the data-view attribute.');
		} else if (!dataid && ( (dataview==="page") || (dataview==="component") || (dataview==="fullscreen") )) {
			console.log('To display a ' + dataview + ', a data-id attribute is required.');
		} else if (!dataid && !dataview) {
			window.location = $(anchor).attr('href');
		} else {
      $.bbq.pushState({ view : dataview, id : "" });
		}
	},
  setDisplayPreferences : function(XMLconfig) {

    // Summary: Read the XML and update any preferences based on what's included

    if($(XMLconfig).find('display > property[name="componentcontainer"]')) {
      EightShapes.Blocks.display.componentcontainer = $(XMLconfig).find('display > property[name="componentcontainer"]').attr('value');
    }
    if($(XMLconfig).find('display > property[name="homelinks"]')) {
      EightShapes.Blocks.display.homelinks = $(XMLconfig).find('display > property[name="homelinks"]').attr('value');
    }
    if($(XMLconfig).find('display > property[name="componentextension"]').attr('value')) {
      EightShapes.Blocks.display.componentextension = $(XMLconfig).find('display > property[name="componentextension"]').attr('value');
    }
    if($(XMLconfig).find('display > property[name="componentids"]').attr('value') === "on") {
			EightShapes.Blocks.display.componentids = "on";
		}
    if($(XMLconfig).find('display > property[name="responsiveviewer"]').attr('value') === "on") {
			EightShapes.Blocks.display.responsiveviewer = "on";
    } else {
			$('#esb > menu.toolbar fieldset.responsive').remove();
    }
    if(($(XMLconfig).find('display > property[name="markers"]').attr('value') === "true") || ($(XMLconfig).find('display > property[name="markers"]').attr('value') === "on")) {
			EightShapes.Blocks.display.markers = "on";
		} else {
			EightShapes.Blocks.display.markers = "off";
			$('body#esb > section.pages > menu > button.markers').remove();
		}
    if(($(XMLconfig).find('display > property[name="homepage"]').attr('value') === "on") || (EightShapes.Blocks.display.homepage === "on")) {
			EightShapes.Blocks.display.homepage = "on";
			$('body#esb > header > nav.primary > ul')
				.prepend('<li class="home" data-view="home"><a href="#nowhere"></a></li>');
			if($('body').children('section.home').length === 0) {
				$('body').append('<section class="home"></section>');
			}
		}
    if(($(XMLconfig).find('display > property[name="toolbar"]').attr('value') === "true") || ($(XMLconfig).find('display > property[name="toolbar"]').attr('value') === "on")) {
			EightShapes.Blocks.display.toolbar = "on";
		} else {
			EightShapes.Blocks.display.toolbar = "off";
			$('body#esb > menu').hide();
			if (EightShapes.Blocks.display.markers === "on") {
				$('body').addClass('markers');
			}
		}
    if($(XMLconfig).find('display > property[name="toolbarlocation"]').attr('value')) {
			switch ($(XMLconfig).find('display > property[name="toolbarlocation"]').attr('value')) {
				case "topleft":
					$('body#esb > menu').addClass('topleft');
					break;
				case "topright":
					$('body#esb > menu').addClass('topright');
					break;
				case "bottomleft":
					$('body#esb > menu').addClass('bottomleft');
					break;
				case "bottomright":
					$('body#esb > menu').addClass('bottomright');
					break;
				default:
					$('body#esb > menu').addClass('topright');
					break;
			}
		}
  },
  setPrototypeMetadata : function(XMLconfig) {

    // Summary: Read the XML and setup the prototype metadata (author, title, etc)

    // ESB Header Title
    EightShapes.Blocks.metadata.title = $(XMLconfig).find('metadata').attr('title');
    $('body > header').append('<h1>' + EightShapes.Blocks.metadata.title + '</h1><dl></dl>');

    // ESB Header Metadata
    EightShapes.Blocks.metadata.version = $(XMLconfig).find('metadata > version').attr('number');
    EightShapes.Blocks.metadata.author = $(XMLconfig).find('metadata > author').attr('name');
    EightShapes.Blocks.metadata.versiondate = $(XMLconfig).find('metadata > version').attr('date');
    EightShapes.Blocks.metadata.client = $(XMLconfig).find('metadata > client').attr('name');
    $('body > header > dl')
      .append('<dt>Version</dt> <dd>' + EightShapes.Blocks.metadata.version + '</dd> ')
      .append('<dt>by</dt> <dd>' + EightShapes.Blocks.metadata.author + '</dd> ')
      .append('<dt>on</dt> <dd>' + EightShapes.Blocks.metadata.versiondate + '</dd> ')
      .append('<dt>for</dt> <dd>' + EightShapes.Blocks.metadata.client + '</dd> ')
  },
	setGridScale : function() {
		$('#esb > section.pages > article')
		  .css('width',1000*EightShapes.Blocks.display.galleryscale)
		  .css('height',1000*EightShapes.Blocks.display.aspectratio*EightShapes.Blocks.display.galleryscale+50);
 		$('#esb > section.pages > article > section.viewport')
 		  .css('-moz-transform','scale('+EightShapes.Blocks.display.galleryscale+')')
 		  .css('-webkit-transform','scale('+EightShapes.Blocks.display.galleryscale+')')
 		  .css('height',960*EightShapes.Blocks.display.aspectratio);
	},
	clearGridScale : function() {
		$('#esb > section.pages > article').css('width','').css('height','');
 		$('#esb > section.pages > article > section.viewport').css('-moz-transform','').css('-webkit-transform','').css('height','');
	},
  menuMarkup : function(blocksSection) {

    // Summary: Centralize the markup added for toolbar sliders, buttons, etc

		if($(blocksSection).hasClass('pages')) {
    	$(blocksSection).prepend('<menu><span class="controlset  viewas"><button class="list active">List</button><button class="thumbnail">Thumbnail</button><button class="grid">Grid</button></span><button class="exitfullscreen">Exit Full Screen</button><button class="markers">Markers</button><button class="previous">Previous</button><button class="next">Next</button></menu>');
		} else {
			$(blocksSection).prepend('<menu></menu>');
		}

		// Sliders HTML <span class="controlset sizeslider"><h3>Size</h3><span class="icon small"></span><div class="esbgallerysize" style="width: 100px;"></div><span class="icon large"></span></span><span class="controlset heightslider"><h3>Height</h3><span class="icon short"></span><div class="esbgalleryaspectratio" style="width: 100px;"></div><span class="icon tall"></span></span>
  },
  articleHeader : function(item) {

    // Summary: Adds simple markup inside HEADER of an article in BODY>SECTION.pages,
    // including buttons, labels, and more
    // Called by: registerPage
    // Preconditions: ARTICLE>HEADER exists

    if (EightShapes.Blocks.display.toolbar) {
      return '<button class="fullscreen"></button><a href="#nowhere"><h2 class="' + item.doneness + '" data-view="' + item.id + '">' + item.title + '</h2></a><span class="version">' + item.version + '</span><span class="description">' + item.description + '</span>';
    } else {
      return '';
    }
  },
	displayTitle : function(id,title) {
		var displaytitle = "";
		if (EightShapes.Blocks.display.componentids === "on") {
			displaytitle = "<i>" + id + "</i> ";
			if (title) {
				displaytitle += title;
			}
		} else {
			if (title) {
				displaytitle = title;
			} else {
				displaytitle = "Untitled";
			}
		}
		return displaytitle;
	},
  sourceURL : function(type) {
    switch(type) {
    case "library":
      return "library/components/";
    case "project":
      return "components/";
    default:
      return "components/";
    }
  },
  keyboardshortcuts : function(event) {
    var currentView = $.bbq.getState( "view" ) ? $.bbq.getState( "view" ) : "fullscreen";
    if (event.altKey) {
      if (event.shiftKey) {
      switch(event.keyCode) {
        case 77: // M
          ($('body').hasClass('markers')) ? $('body').removeClass('markers') : $('body').addClass('markers');
          break;
        case 39: // ALT ARROW >
          if ($('body#esb > section.pages.active.notes') || $('body#esb.fullscreen')) {
            var currentPage = $('#esb > section.pages > article.page.active');
            if($(currentPage).next().is('article')) {
              if(!EightShapes.Blocks.p[$(currentPage).next().attr('data-id')].loaded) {
                EightShapes.Blocks.p[$(currentPage).next().attr('data-id')].load();
              }
              $.bbq.pushState({view: currentView, id:$(currentPage).next().attr('data-id')});
            }
          }
          break;
        case 37: // ALT ARROW <
          if ($('body#esb > section.pages.active.notes') || $('body#esb.fullscreen')) {
            var currentPage = $('#esb > section.pages > article.page.active');
            if($(currentPage).prev().is('article')) {
              $.bbq.pushState({view: currentView, id:$(currentPage).prev().attr('data-id')});
            }
          }
          break;
      }
      }
    }
  },
  containComponent : function(id,variationid) {

    // Summary: Adds a class to component variations for "customizeable width displays"
    // within Component Grids and Notes
		if (variationid && EightShapes.Blocks.c[id].variations[variationid].container) {
			return EightShapes.Blocks.c[id].container + " " + EightShapes.Blocks.c[id].variations[variationid].container;
		} else if (EightShapes.Blocks.c[id].container) {
			return EightShapes.Blocks.c[id].container;
		} else {
			return EightShapes.Blocks.display.componentcontainer;
		}
  }

};

$(document).ready(function(){
  EightShapes.Blocks.init();

  $(window).bind( "hashchange", function(e) {
    EightShapes.Blocks.view();
  })

  $(document).keydown(function (event) {
    EightShapes.Blocks.keyboardshortcuts(event);
  });
});
