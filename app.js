/**
 * Isochrone Map Application
 * Calculates and displays travel time/distance zones on an interactive map
 */

(function() {
    'use strict';

    // ========================================
    // Configuration
    // ========================================

    const CONFIG = {
        // Default map center (New York City)
        defaultCenter: [40.7128, -74.0060],
        defaultZoom: 12,

        // OpenRouteService API endpoint
        orsApiUrl: 'https://api.openrouteservice.org/v2/isochrones/',

        // Demo API key (limited - users should get their own)
        // Get free key at: https://openrouteservice.org/dev/#/signup
        defaultApiKey: '5b3ce3597851110001cf6248a9d5c5a5a5d54b8a9e5c0c0a9d5c5a5a',

        // Time thresholds in seconds (displayed in minutes)
        timeThresholds: [
            { value: 300, label: '5 min', color: '#22c55e' },      // Green
            { value: 600, label: '10 min', color: '#84cc16' },     // Lime
            { value: 900, label: '15 min', color: '#eab308' },     // Yellow
            { value: 1800, label: '30 min', color: '#f97316' },    // Orange
            { value: 3600, label: '1 hr', color: '#ef4444' },      // Red
            { value: 5400, label: '1.5 hr', color: '#dc2626' },    // Dark Red
            { value: 7200, label: '2 hr', color: '#b91c1c' },      // Darker Red
            { value: 10800, label: '3 hr', color: '#991b1b' },     // Deep Red
            { value: 14400, label: '4 hr', color: '#7f1d1d' },     // Maroon
            { value: 18000, label: '5 hr', color: '#581c1c' }      // Dark Maroon
        ],

        // Distance thresholds in meters (displayed in km/miles)
        distanceThresholds: [
            { value: 1000, label: '1 km', color: '#22c55e' },
            { value: 2000, label: '2 km', color: '#84cc16' },
            { value: 5000, label: '5 km', color: '#eab308' },
            { value: 10000, label: '10 km', color: '#f97316' },
            { value: 20000, label: '20 km', color: '#ef4444' },
            { value: 30000, label: '30 km', color: '#dc2626' },
            { value: 50000, label: '50 km', color: '#b91c1c' },
            { value: 75000, label: '75 km', color: '#991b1b' },
            { value: 100000, label: '100 km', color: '#7f1d1d' },
            { value: 150000, label: '150 km', color: '#581c1c' }
        ],

        // Transport mode profiles for OpenRouteService
        transportModes: {
            'driving-car': 'driving-car',
            'foot-walking': 'foot-walking',
            'cycling-regular': 'cycling-regular',
            'wheelchair': 'wheelchair'
        },

        // Max ranges by transport mode (ORS limitations)
        maxRanges: {
            'driving-car': { time: 18000, distance: 150000 },      // 5 hours, 150 km
            'foot-walking': { time: 7200, distance: 20000 },       // 2 hours, 20 km
            'cycling-regular': { time: 10800, distance: 50000 },   // 3 hours, 50 km
            'wheelchair': { time: 7200, distance: 20000 }          // 2 hours, 20 km
        }
    };

    // ========================================
    // Application State
    // ========================================

    const state = {
        map: null,
        originMarker: null,
        originLatLng: null,
        isochroneLayers: [],
        measurementMode: 'time', // 'time' or 'distance'
        transportMode: 'driving-car',
        selectedThresholds: new Set([0, 1, 2, 3, 4]), // Default: first 5 thresholds
        apiKey: localStorage.getItem('ors_api_key') || CONFIG.defaultApiKey,
        isLoading: false,
        geocoder: null
    };

    // ========================================
    // DOM Elements
    // ========================================

    const elements = {};

    function cacheElements() {
        elements.sidebar = document.getElementById('sidebar');
        elements.sidebarToggle = document.getElementById('sidebar-toggle');
        elements.mobileMenuBtn = document.getElementById('mobile-menu-btn');
        elements.addressInput = document.getElementById('address-input');
        elements.searchBtn = document.getElementById('search-btn');
        elements.modeTime = document.getElementById('mode-time');
        elements.modeDistance = document.getElementById('mode-distance');
        elements.timeThresholdsSection = document.getElementById('time-thresholds-section');
        elements.distanceThresholdsSection = document.getElementById('distance-thresholds-section');
        elements.timeThresholdList = document.getElementById('time-threshold-list');
        elements.distanceThresholdList = document.getElementById('distance-threshold-list');
        elements.generateBtn = document.getElementById('generate-btn');
        elements.clearBtn = document.getElementById('clear-btn');
        elements.legendSection = document.getElementById('legend-section');
        elements.legend = document.getElementById('legend');
        elements.loading = document.getElementById('loading');
        elements.coordsText = document.getElementById('coords-text');
        elements.apiKeyInput = document.getElementById('api-key-input');
        elements.saveApiKeyBtn = document.getElementById('save-api-key');
        elements.toast = document.getElementById('toast');
        elements.toastMessage = document.getElementById('toast-message');
        elements.transportBtns = document.querySelectorAll('.transport-btn');
    }

    // ========================================
    // Initialization
    // ========================================

    function init() {
        cacheElements();
        initMap();
        initGeocoder();
        renderThresholds();
        bindEvents();
        loadSavedApiKey();
        updateGenerateButton();
    }

    function initMap() {
        // Create map
        state.map = L.map('map', {
            center: CONFIG.defaultCenter,
            zoom: CONFIG.defaultZoom,
            zoomControl: true
        });

        // Add tile layer (OpenStreetMap)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(state.map);

        // Alternative: Google Maps tiles (uncomment to use)
        // L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        //     attribution: '&copy; Google Maps',
        //     maxZoom: 20
        // }).addTo(state.map);

        // Move zoom control to right side on desktop
        state.map.zoomControl.setPosition('topright');

        // Map click handler
        state.map.on('click', handleMapClick);

        // Update coordinates on mouse move
        state.map.on('mousemove', handleMouseMove);
    }

    function initGeocoder() {
        state.geocoder = L.Control.Geocoder.nominatim({
            geocodingQueryParams: {
                limit: 5
            }
        });
    }

    function renderThresholds() {
        renderThresholdList(CONFIG.timeThresholds, elements.timeThresholdList, 'time');
        renderThresholdList(CONFIG.distanceThresholds, elements.distanceThresholdList, 'distance');
    }

    function renderThresholdList(thresholds, container, type) {
        container.innerHTML = '';

        thresholds.forEach((threshold, index) => {
            const item = document.createElement('div');
            item.className = 'threshold-item' + (state.selectedThresholds.has(index) ? ' selected' : '');
            item.dataset.index = index;
            item.dataset.type = type;

            item.innerHTML = `
                <input type="checkbox"
                       id="${type}-threshold-${index}"
                       ${state.selectedThresholds.has(index) ? 'checked' : ''}>
                <span class="color-swatch" style="background-color: ${threshold.color}"></span>
                <label for="${type}-threshold-${index}">${threshold.label}</label>
            `;

            item.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT') {
                    const checkbox = item.querySelector('input[type="checkbox"]');
                    checkbox.checked = !checkbox.checked;
                }
                toggleThreshold(index, item.querySelector('input').checked);
                item.classList.toggle('selected', item.querySelector('input').checked);
            });

            container.appendChild(item);
        });
    }

    function loadSavedApiKey() {
        const savedKey = localStorage.getItem('ors_api_key');
        if (savedKey) {
            state.apiKey = savedKey;
            elements.apiKeyInput.value = savedKey;
        }
    }

    // ========================================
    // Event Binding
    // ========================================

    function bindEvents() {
        // Sidebar toggle (mobile)
        elements.sidebarToggle.addEventListener('click', toggleSidebar);
        elements.mobileMenuBtn.addEventListener('click', toggleSidebar);

        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768) {
                if (!elements.sidebar.contains(e.target) &&
                    !elements.mobileMenuBtn.contains(e.target) &&
                    elements.sidebar.classList.contains('open')) {
                    elements.sidebar.classList.remove('open');
                }
            }
        });

        // Address search
        elements.searchBtn.addEventListener('click', handleAddressSearch);
        elements.addressInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleAddressSearch();
        });

        // Measurement mode toggle
        elements.modeTime.addEventListener('click', () => setMeasurementMode('time'));
        elements.modeDistance.addEventListener('click', () => setMeasurementMode('distance'));

        // Transport mode selection
        elements.transportBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.transport;
                setTransportMode(mode);
            });
        });

        // Generate and clear buttons
        elements.generateBtn.addEventListener('click', generateIsochrones);
        elements.clearBtn.addEventListener('click', clearMap);

        // API key
        elements.saveApiKeyBtn.addEventListener('click', saveApiKey);
        elements.apiKeyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') saveApiKey();
        });
    }

    // ========================================
    // Event Handlers
    // ========================================

    function handleMapClick(e) {
        setOrigin(e.latlng);
    }

    function handleMouseMove(e) {
        if (!state.originLatLng) {
            elements.coordsText.textContent = `Lat: ${e.latlng.lat.toFixed(5)}, Lng: ${e.latlng.lng.toFixed(5)}`;
        }
    }

    function handleAddressSearch() {
        const query = elements.addressInput.value.trim();
        if (!query) {
            showToast('Please enter an address', 'error');
            return;
        }

        showLoading(true, 'Searching...');

        state.geocoder.geocode(query, (results) => {
            showLoading(false);

            if (results && results.length > 0) {
                const result = results[0];
                const latlng = L.latLng(result.center.lat, result.center.lng);
                setOrigin(latlng);
                state.map.setView(latlng, 13);
                elements.addressInput.value = result.name;
                showToast('Location found', 'success');

                // Close sidebar on mobile
                if (window.innerWidth <= 768) {
                    elements.sidebar.classList.remove('open');
                }
            } else {
                showToast('Address not found. Try a different search.', 'error');
            }
        });
    }

    function setOrigin(latlng) {
        state.originLatLng = latlng;

        // Remove existing marker
        if (state.originMarker) {
            state.map.removeLayer(state.originMarker);
        }

        // Create custom marker icon
        const icon = L.divIcon({
            className: 'origin-marker',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        // Add new marker
        state.originMarker = L.marker(latlng, { icon: icon })
            .addTo(state.map)
            .bindPopup(`<strong>Origin</strong><br>Lat: ${latlng.lat.toFixed(5)}<br>Lng: ${latlng.lng.toFixed(5)}`)
            .openPopup();

        // Update coordinates display
        elements.coordsText.textContent = `Origin: ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;

        // Enable generate button
        updateGenerateButton();
    }

    function toggleSidebar() {
        elements.sidebar.classList.toggle('open');
    }

    function setMeasurementMode(mode) {
        state.measurementMode = mode;

        // Update UI
        elements.modeTime.classList.toggle('active', mode === 'time');
        elements.modeDistance.classList.toggle('active', mode === 'distance');
        elements.timeThresholdsSection.classList.toggle('hidden', mode !== 'time');
        elements.distanceThresholdsSection.classList.toggle('hidden', mode !== 'distance');

        // Reset selected thresholds for new mode
        resetThresholdSelection();
    }

    function setTransportMode(mode) {
        state.transportMode = mode;

        // Update UI
        elements.transportBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.transport === mode);
        });

        // Update threshold availability based on transport mode limits
        updateThresholdAvailability();
    }

    function toggleThreshold(index, selected) {
        if (selected) {
            state.selectedThresholds.add(index);
        } else {
            state.selectedThresholds.delete(index);
        }
        updateGenerateButton();
    }

    function resetThresholdSelection() {
        state.selectedThresholds = new Set([0, 1, 2, 3, 4]);

        // Update UI
        const container = state.measurementMode === 'time'
            ? elements.timeThresholdList
            : elements.distanceThresholdList;

        container.querySelectorAll('.threshold-item').forEach((item, index) => {
            const checkbox = item.querySelector('input[type="checkbox"]');
            const isSelected = state.selectedThresholds.has(index);
            checkbox.checked = isSelected;
            item.classList.toggle('selected', isSelected);
        });
    }

    function updateThresholdAvailability() {
        const maxRanges = CONFIG.maxRanges[state.transportMode];
        const thresholds = state.measurementMode === 'time'
            ? CONFIG.timeThresholds
            : CONFIG.distanceThresholds;
        const maxValue = state.measurementMode === 'time'
            ? maxRanges.time
            : maxRanges.distance;

        const container = state.measurementMode === 'time'
            ? elements.timeThresholdList
            : elements.distanceThresholdList;

        container.querySelectorAll('.threshold-item').forEach((item, index) => {
            const threshold = thresholds[index];
            const isAvailable = threshold.value <= maxValue;
            const checkbox = item.querySelector('input[type="checkbox"]');

            item.style.opacity = isAvailable ? '1' : '0.4';
            checkbox.disabled = !isAvailable;

            if (!isAvailable && state.selectedThresholds.has(index)) {
                state.selectedThresholds.delete(index);
                checkbox.checked = false;
                item.classList.remove('selected');
            }
        });

        updateGenerateButton();
    }

    function updateGenerateButton() {
        const hasOrigin = state.originLatLng !== null;
        const hasThresholds = state.selectedThresholds.size > 0;
        elements.generateBtn.disabled = !hasOrigin || !hasThresholds;
    }

    function saveApiKey() {
        const key = elements.apiKeyInput.value.trim();
        if (key) {
            state.apiKey = key;
            localStorage.setItem('ors_api_key', key);
            showToast('API key saved', 'success');
        } else {
            showToast('Please enter a valid API key', 'error');
        }
    }

    // ========================================
    // Isochrone Generation
    // ========================================

    async function generateIsochrones() {
        if (!state.originLatLng) {
            showToast('Please set an origin point first', 'error');
            return;
        }

        if (state.selectedThresholds.size === 0) {
            showToast('Please select at least one threshold', 'error');
            return;
        }

        // Clear existing isochrones
        clearIsochrones();

        // Get selected thresholds
        const thresholds = state.measurementMode === 'time'
            ? CONFIG.timeThresholds
            : CONFIG.distanceThresholds;

        const selectedRanges = Array.from(state.selectedThresholds)
            .map(i => thresholds[i])
            .filter(t => t !== undefined)
            .sort((a, b) => b.value - a.value); // Sort descending for proper layering

        if (selectedRanges.length === 0) {
            showToast('No valid thresholds selected', 'error');
            return;
        }

        showLoading(true, 'Calculating isochrones...');

        try {
            const rangeValues = selectedRanges.map(t => t.value);
            const rangeType = state.measurementMode === 'time' ? 'time' : 'distance';

            const response = await fetch(CONFIG.orsApiUrl + state.transportMode, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': state.apiKey
                },
                body: JSON.stringify({
                    locations: [[state.originLatLng.lng, state.originLatLng.lat]],
                    range: rangeValues,
                    range_type: rangeType,
                    smoothing: 25,
                    area_units: 'km'
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error?.message || `API error: ${response.status}`);
            }

            const data = await response.json();

            if (!data.features || data.features.length === 0) {
                throw new Error('No isochrone data received');
            }

            // Render isochrones (largest first for proper layering)
            data.features.reverse().forEach((feature, index) => {
                const rangeValue = feature.properties.value;
                const threshold = selectedRanges.find(t => t.value === rangeValue);

                if (threshold) {
                    const layer = L.geoJSON(feature, {
                        style: {
                            fillColor: threshold.color,
                            fillOpacity: 0.35,
                            color: threshold.color,
                            weight: 2,
                            opacity: 0.8
                        }
                    }).addTo(state.map);

                    layer.bindPopup(`<strong>${threshold.label}</strong> ${state.measurementMode === 'time' ? 'travel time' : 'distance'}`);
                    state.isochroneLayers.push(layer);
                }
            });

            // Fit map to isochrone bounds
            if (state.isochroneLayers.length > 0) {
                const group = L.featureGroup(state.isochroneLayers);
                state.map.fitBounds(group.getBounds().pad(0.1));
            }

            // Show legend
            updateLegend(selectedRanges.reverse());
            elements.legendSection.style.display = 'block';

            showLoading(false);
            showToast('Isochrones generated successfully', 'success');

            // Close sidebar on mobile
            if (window.innerWidth <= 768) {
                elements.sidebar.classList.remove('open');
            }

        } catch (error) {
            showLoading(false);
            console.error('Isochrone error:', error);

            if (error.message.includes('403') || error.message.includes('401')) {
                showToast('Invalid API key. Please check your OpenRouteService API key.', 'error');
            } else if (error.message.includes('429')) {
                showToast('API rate limit exceeded. Please try again later.', 'error');
            } else {
                showToast(`Error: ${error.message}`, 'error');
            }
        }
    }

    function updateLegend(thresholds) {
        elements.legend.innerHTML = '';

        thresholds.forEach(threshold => {
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.innerHTML = `
                <span class="legend-color" style="background-color: ${threshold.color}"></span>
                <span>${threshold.label}</span>
            `;
            elements.legend.appendChild(item);
        });
    }

    function clearIsochrones() {
        state.isochroneLayers.forEach(layer => {
            state.map.removeLayer(layer);
        });
        state.isochroneLayers = [];
        elements.legendSection.style.display = 'none';
    }

    function clearMap() {
        clearIsochrones();

        if (state.originMarker) {
            state.map.removeLayer(state.originMarker);
            state.originMarker = null;
        }

        state.originLatLng = null;
        elements.addressInput.value = '';
        elements.coordsText.textContent = 'Click map to set origin';
        updateGenerateButton();
        showToast('Map cleared', 'success');
    }

    // ========================================
    // UI Helpers
    // ========================================

    function showLoading(show, message = 'Loading...') {
        state.isLoading = show;
        elements.loading.classList.toggle('hidden', !show);
        elements.loading.querySelector('p').textContent = message;
    }

    function showToast(message, type = 'info') {
        elements.toast.classList.remove('hidden', 'error', 'success');
        elements.toast.classList.add(type);
        elements.toastMessage.textContent = message;

        setTimeout(() => {
            elements.toast.classList.add('hidden');
        }, 4000);
    }

    // ========================================
    // Start Application
    // ========================================

    document.addEventListener('DOMContentLoaded', init);

})();
