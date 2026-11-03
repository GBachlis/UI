function SmartDashboardPlugin() {
    return function install(openmct) {

       const allSensors = [
            // Pressure Transducers (PT)
            { name: 'PT-M1 (Manifold 1)', namespace: 'rocket', key: 'pt-m1' },
            { name: 'PT-M2 (Manifold 2)', namespace: 'rocket', key: 'pt-m2' },
            { name: 'PT-C (Combustion)', namespace: 'rocket', key: 'pt-c' },
            { name: 'PT-N2 (Nitrogen Filling)', namespace: 'rocket', key: 'pt-n2' },
            { name: 'PT-ED (Ethanol Down)', namespace: 'rocket', key: 'pt-ed' },
            { name: 'PT-LU (LOx Up)', namespace: 'rocket', key: 'pt-lu' },
            { name: 'PT-LD (LOx Down)', namespace: 'rocket', key: 'pt-ld' },
            { name: 'PT-P (Pressurant)', namespace: 'rocket', key: 'pt-p' },
            { name: 'PT-FS (Fire Suppression)', namespace: 'rocket', key: 'pt-fs' },
        
        
            // Load Cells (LC)
            { name: 'LC-T (Thrust)', namespace: 'rocket', key: 'lc-t' },
            { name: 'LC-L (LOx Weight)', namespace: 'rocket', key: 'lc-l' },
            { name: 'LC-E (Ethanol Weight)', namespace: 'rocket', key: 'lc-e' }
       ];

       openmct.types.addType('smart-dashboard', {
           name: 'Smart Dashboard',
           description: 'Dynamic telemetry dashboard',
           cssClass: 'icon-layout',
           creatable: true
       });

       openmct.objectViews.addProvider({
           key: 'smart-dashboard-view',
           name: 'Smart Dashboard View',
           cssClass: 'icon-layout',
           canView: function(domainObject) {
               return domainObject.type === 'smart-dashboard';
           },
           view: function(domainObject) {
               let activeViews = [];
               let gridContainer;

               return {
                   show: function(container) {
                       container.innerHTML = `
                           <div style="display:flex; height:100%; width:100%;">
                               <div id="sensor-sidebar" style="width:260px; padding:15px; background:#1c1c1c; border-right:1px solid #444; overflow:auto;">
                                   <h3 style="color:white; margin-top:0;">Telemetry List</h3>
                               </div>
                               <div id="dashboard-grid" style="flex:1; padding:15px; display:grid; grid-template-columns: repeat(auto-fill,minmax(550px,1fr)); grid-auto-rows:350px; gap:15px; overflow:auto; background:#111;">
                               </div>
                           </div>
                       `;

                       const sidebar = container.querySelector('#sensor-sidebar');
                       gridContainer = container.querySelector('#dashboard-grid');

                       allSensors.forEach(sensor => {
                           const btn = document.createElement('button');
                           btn.innerText = "+ " + sensor.name;

                           btn.style.width = "100%";
                           btn.style.padding = "12px";
                           btn.style.marginBottom = "8px";
                           btn.style.background = "#2a2a2a";
                           btn.style.color = "#ddd";
                           btn.style.border = "1px solid #444";
                           btn.style.borderRadius = "5px";
                           btn.style.cursor = "pointer";

                           btn.onmouseover = () => { btn.style.background = "#444"; };
                           btn.onmouseout = () => { btn.style.background = "#2a2a2a"; };
                           
                           btn.onclick = async () => {
                               console.log("Loading sensor:", sensor.name);

                               const tile = document.createElement('div');
                               tile.style.position = "relative";
                               tile.style.background = "#1a1a24"; 
                               tile.style.border = "1px solid #444";
                               tile.style.borderRadius = "6px";
                               tile.style.overflow = "hidden";
                               tile.style.width = "100%";
                               tile.style.height = "100%";
                               tile.style.display = "flex"; 
                               tile.style.flexDirection = "row";

                               const plotContainer = document.createElement('div');
                               plotContainer.style.flex = "6";
                               plotContainer.style.height = "100%";
                               plotContainer.style.position = "relative";

                               const widgetContainer = document.createElement('div');
                               widgetContainer.style.flex = "4";
                               widgetContainer.style.height = "100%";
                               widgetContainer.style.position = "relative";
                               widgetContainer.style.borderLeft = "1px solid #444";

                               tile.appendChild(plotContainer);
                               tile.appendChild(widgetContainer);
                               gridContainer.appendChild(tile);

                               try {
                                   const identifier = { namespace: sensor.namespace, key: sensor.key };
                                   const obj = await openmct.objects.get(identifier);

                                   if (!obj) {
                                       plotContainer.innerHTML = `<div style="color:#ff6b6b; padding:20px;">Σφάλμα 404: Δεν βρέθηκε ο σένσορας!</div>`;
                                       return;
                                   }

                                   // --- 1. ΦΟΡΤΩΣΗ CUSTOM GRAPH (Custom Grid Plot) ---
                                   const mockPlotObj = {
                                       identifier: { namespace: 'mock', key: 'plot-' + sensor.key },
                                       type: 'custom-grid-plot', 
                                       name: sensor.name,
                                       composition: [ obj.identifier ], 
                                       location: 'ROOT'
                                   };

                                   const applicableViews = openmct.objectViews.get(mockPlotObj, [mockPlotObj]);
                                   const plotProvider = applicableViews.find(v => v.key === 'custom-grid-plot-view');

                                   if (plotProvider) {
                                       const plotInstance = plotProvider.view(mockPlotObj, [mockPlotObj]);
                                       if (plotInstance && plotInstance.show) {
                                           plotInstance.show(plotContainer, false, { renderWhenVisible: true });
                                           activeViews.push(plotInstance);
                                       }
                                   } else {
                                       plotContainer.innerHTML = `<div style="color:#888; padding:20px;">Grid Plot View not found</div>`;
                                   }

                                   // --- 2. ΦΟΡΤΩΣΗ WIDGET (Thermometer, Gauge ή Horizontal Bar) ---
                                   let widgetType = '';
                                   let widgetViewKey = '';
                                   let extraProps = {};

                                   if (sensor.name.startsWith('TC-')) {
                                       widgetType = 'custom.thermometer';
                                       widgetViewKey = 'thermometer-view';
                                       extraProps = { thermoMin: 0, thermoMax: 1000 };
                                   } else if (sensor.name.startsWith('PT-')) {
                                       widgetType = 'custom-gauge-type';
                                       widgetViewKey = 'custom-circular-gauge-view';
                                   } else if (sensor.name.startsWith('RTD-') || sensor.name.startsWith('LC-')) {
                                       widgetType = 'custom.horizontalbar'; 
                                       widgetViewKey = 'horizontal-bar-view';
                                       extraProps = { barMin: 0, barMax: 100 };
                                   }

                                   if (widgetType !== '') {
                                       const mockWidgetObj = {
                                           identifier: { namespace: 'mock', key: 'widget-' + sensor.key },
                                           type: widgetType,
                                           name: sensor.name,
                                           composition: [ obj.identifier ], 
                                           location: 'ROOT',
                                           ...extraProps
                                       };

                                       const widgetViews = openmct.objectViews.get(mockWidgetObj, [mockWidgetObj]);
                                       const widgetProvider = widgetViews.find(v => v.key === widgetViewKey);

                                       if (widgetProvider) {
                                           const widgetInstance = widgetProvider.view(mockWidgetObj, [mockWidgetObj]);
                                           if (widgetInstance && widgetInstance.show) {
                                               widgetInstance.show(widgetContainer, false, { renderWhenVisible: true });
                                               activeViews.push(widgetInstance);
                                           }
                                       } else {
                                           widgetContainer.innerHTML = `<div style="color:#888; padding:20px;">Widget view '${widgetViewKey}' not found</div>`;
                                       }
                                   }

                                   setTimeout(() => {
                                       window.dispatchEvent(new Event('resize'));
                                   }, 50);

                               } catch (err) {
                                   console.error("Dashboard error:", err);
                                   plotContainer.innerHTML = `<div style="color:#ff6b6b; padding:20px;">Error:<br>${err.message}</div>`;
                               }
                           };

                           sidebar.appendChild(btn);
                       });
                   },

                   destroy: function() {
                       activeViews.forEach(v => {
                           if (v.destroy) v.destroy();
                       });
                       activeViews = [];
                   }
               };
           }
       });
    };
}