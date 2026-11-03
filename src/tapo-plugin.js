function TapoCameraPlugin() {
    return function install(openmct) {
        openmct.types.addType('tapo.hexacamera', {
            name: '6-Way Tapo Stream',
            description: 'Live 6-way WebRTC video feed from Tapo Cameras',
            cssClass: 'icon-camera',
            creatable: true
        });

        openmct.objectViews.addProvider({
            key: 'tapo-hexa-view', 
            name: '6-Way Video',
            cssClass: 'icon-camera',
            canView: function (domainObject) {
                return domainObject.type === 'tapo.hexacamera';
            },
            view: function (domainObject) {
                return {
                    show: function (container) {
                        const grid = document.createElement('div');
                        grid.style.display = 'grid';
                        grid.style.gridTemplateColumns = '1fr 1fr 1fr';
                        grid.style.gridTemplateRows = '1fr 1fr';
                        grid.style.gap = '4px';
                        grid.style.width = '100%';
                        grid.style.height = '100%';
                        grid.style.backgroundColor = '#000';

                        const host = window.location.hostname;
                        const urls = [
                            `http://${host}:1984/stream.html?src=cam1`,
                            `http://${host}:1984/stream.html?src=cam2`,
                            `http://${host}:1984/stream.html?src=cam3`,
                            `http://${host}:1984/stream.html?src=cam4`,
                            `http://${host}:1984/stream.html?src=cam5`,
                            `http://${host}:1984/stream.html?src=cam6`
                        ];

                        urls.forEach((url) => {
                            const cell = document.createElement('div');
                            cell.style.width = '100%';
                            cell.style.height = '100%';
                            cell.style.position = 'relative';
                            cell.style.backgroundColor = '#1a1a1a';
                            cell.style.overflow = 'hidden';

                            const iframe = document.createElement('iframe');
                            iframe.src = url;
                            iframe.style.width = '100%';
                            iframe.style.height = '100%';
                            iframe.style.border = 'none';
                            iframe.setAttribute('allow', 'autoplay; fullscreen');
                            cell.appendChild(iframe);
                            
                            grid.appendChild(cell);
                        });

                        container.appendChild(grid);
                    },
                    destroy: function (container) {
                        container.innerHTML = '';
                    }
                };
            }
        });
    };
}