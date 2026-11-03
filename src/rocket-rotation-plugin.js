function RocketRotationPlugin() {
    return function install(openmct) {
        openmct.objectViews.addProvider({
            key: 'rocket-3d-rotation-view',
            name: 'Προσομοίωση Περιστροφής (3D)',
            cssClass: 'icon-object',
            
            canView: function (domainObject) {
                return domainObject.type === 'rocket.servo';
            },
            
            view: function (domainObject) {
                let unsubscribe;
                let containerElement;
                let animationId;

                return {
                    show: function (container) {
                        containerElement = container;
                        
                        // 1. Δημιουργία UI Overlay (για τα νούμερα)
                        container.innerHTML = `
                            <div style="position: absolute; top: 10px; left: 10px; z-index: 10; background: rgba(0,0,0,0.6); padding: 15px; border-radius: 8px; color: #d1d5db; border: 1px solid #4b5563;">
                                <h3 style="margin: 0 0 10px 0; color: #60a5fa;">${domainObject.name}</h3>
                                <div style="font-size: 1.2em;">Γωνία: <span id="deg-val" style="color: #10b981; font-weight: bold;">0</span>°</div>
                            </div>
                            <div id="three-canvas-container" style="width: 100%; height: 100%;"></div>
                        `;

                        const degVal = container.querySelector('#deg-val');
                        const canvasContainer = container.querySelector('#three-canvas-container');

                        // 2. Στήσιμο του Three.js (Σκηνή, Κάμερα, Renderer)
                        const scene = new THREE.Scene();
                        const camera = new THREE.PerspectiveCamera(75, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 1000);
                        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
                        
                        renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
                        canvasContainer.appendChild(renderer.domElement);

                        // 3. Δημιουργία 3D Πυραύλου
                        const rocketGroup = new THREE.Group();

                        // Σώμα (Κύλινδρος)
                        const bodyGeo = new THREE.CylinderGeometry(0.5, 0.5, 3, 32);
                        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
                        const body = new THREE.Mesh(bodyGeo, bodyMat);
                        
                        // Μύτη (Κώνος)
                        const noseGeo = new THREE.ConeGeometry(0.5, 1, 32);
                        const noseMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
                        const nose = new THREE.Mesh(noseGeo, noseMat);
                        nose.position.y = 2; // Τοποθέτηση πάνω από το σώμα

                        rocketGroup.add(body);
                        rocketGroup.add(nose);
                        
                        // Γέρνουμε τον πύραυλο ελαφρώς για να φαίνεται ωραία στο 3D
                        rocketGroup.rotation.x = Math.PI / 4; 
                        
                        scene.add(rocketGroup);

                        // 4. Φωτισμός
                        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
                        scene.add(ambientLight);
                        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
                        dirLight.position.set(5, 5, 5);
                        scene.add(dirLight);

                        camera.position.z = 5;

                        // 5. Animation Loop
                        let targetRotationZ = 0; // Η γωνία που μας στέλνει η τηλεμετρία

                        function animate() {
                            animationId = requestAnimationFrame(animate);
                            
                            // Ομαλή περιστροφή του 3D μοντέλου γύρω από τον άξονά του
                            rocketGroup.rotation.y = targetRotationZ;
                            
                            renderer.render(scene, camera);
                        }
                        animate();

                        // 6. Λήψη Τηλεμετρίας
                        unsubscribe = openmct.telemetry.subscribe(domainObject, function (datum) {
                            const degrees = datum.value || 0;
                            
                            degVal.innerText = degrees.toFixed(2);
                            
                            // Μετατροπή μοιρών σε Ακτίνια (Radians) για το Three.js
                            targetRotationZ = degrees * (Math.PI / 180);
                        });

                        // 7. Αναπροσαρμογή μεγέθους παραθύρου
                        window.addEventListener('resize', onWindowResize, false);
                        function onWindowResize() {
                            if (canvasContainer) {
                                camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
                                camera.updateProjectionMatrix();
                                renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
                            }
                        }
                    },
                    
                    destroy: function () {
                        if (unsubscribe) unsubscribe();
                        if (animationId) cancelAnimationFrame(animationId);
                        containerElement.innerHTML = '';
                    }
                };
            }
        });
    };
}