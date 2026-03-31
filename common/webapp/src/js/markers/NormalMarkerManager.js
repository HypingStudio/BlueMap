/*
 * This file is part of BlueMap, licensed under the MIT License (MIT).
 *
 * Copyright (c) Blue (Lukas Rieger) <https://bluecolored.de>
 * Copyright (c) contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
import { MarkerManager } from "./MarkerManager";
import { PLAYER_MARKER_SET_ID } from "./PlayerMarkerManager";

const MARKER_HIDE_DISTANCE = 3000;
const MARKER_VIEW_RADIUS_FACTOR = 3;
const VIEWPORT_UPDATE_THRESHOLD = 100;

export class NormalMarkerManager extends MarkerManager {

    constructor(root, fileUrl, events = null, controlsManager = null) {
        super(root, fileUrl, events);

        this.controlsManager = controlsManager;
        this._rawMarkerData = null;
        this._lastFilterX = null;
        this._lastFilterZ = null;
        this._lastFilterDistance = null;
        this._viewportUpdateScheduled = false;

        if (events && controlsManager) {
            this._onCameraMove = () => this._scheduleViewportUpdate();
            events.addEventListener("bluemapCameraMoved", this._onCameraMove);
        }
    }

    updateFromData(markerData) {
        this._rawMarkerData = markerData;
        this._applyViewportFilter();
        return true;
    }

    clear() {
        this._rawMarkerData = null;
        this.root.updateMarkerSetsFromData({}, [PLAYER_MARKER_SET_ID, "bm-popup-set"]);
    }

    dispose() {
        if (this._onCameraMove && this.events) {
            this.events.removeEventListener("bluemapCameraMoved", this._onCameraMove);
        }
        super.dispose();
    }

    _scheduleViewportUpdate() {
        if (this._viewportUpdateScheduled || !this._rawMarkerData) return;
        if (!this._needsViewportUpdate()) return;

        this._viewportUpdateScheduled = true;
        setTimeout(() => {
            this._viewportUpdateScheduled = false;
            this._applyViewportFilter();
        }, 200);
    }

    _needsViewportUpdate() {
        if (!this.controlsManager) return false;
        if (this._lastFilterX === null) return true;

        const pos = this.controlsManager.position;
        const distance = this.controlsManager.distance;

        if (this._lastFilterDistance !== null) {
            const wasHidden = this._lastFilterDistance > MARKER_HIDE_DISTANCE;
            const isHidden = distance > MARKER_HIDE_DISTANCE;
            if (wasHidden !== isHidden) return true;

            if (Math.abs(distance - this._lastFilterDistance) > this._lastFilterDistance * 0.3) return true;
        }

        const dx = Math.abs(pos.x - this._lastFilterX);
        const dz = Math.abs(pos.z - this._lastFilterZ);
        return dx > VIEWPORT_UPDATE_THRESHOLD || dz > VIEWPORT_UPDATE_THRESHOLD;
    }

    _applyViewportFilter() {
        if (!this._rawMarkerData) return;

        if (!this.controlsManager) {
            this.root.updateMarkerSetsFromData(this._rawMarkerData, [PLAYER_MARKER_SET_ID, "bm-popup-set"]);
            return;
        }

        const pos = this.controlsManager.position;
        const distance = this.controlsManager.distance;

        this._lastFilterX = pos.x;
        this._lastFilterZ = pos.z;
        this._lastFilterDistance = distance;

        if (distance > MARKER_HIDE_DISTANCE) {
            this.root.updateMarkerSetsFromData({}, [PLAYER_MARKER_SET_ID, "bm-popup-set"]);
            return;
        }

        const viewRadius = distance * MARKER_VIEW_RADIUS_FACTOR;
        const filtered = this._filterByViewport(this._rawMarkerData, pos.x, pos.z, viewRadius);
        this.root.updateMarkerSetsFromData(filtered, [PLAYER_MARKER_SET_ID, "bm-popup-set"]);
    }

    _filterByViewport(markerData, camX, camZ, viewRadius) {
        const result = {};
        for (const [setId, setData] of Object.entries(markerData)) {
            result[setId] = this._filterMarkerSet(setData, camX, camZ, viewRadius);
        }
        return result;
    }

    _filterMarkerSet(setData, camX, camZ, viewRadius) {
        const filtered = { ...setData };

        if (setData.markerSets) {
            filtered.markerSets = {};
            for (const [id, nestedSet] of Object.entries(setData.markerSets)) {
                filtered.markerSets[id] = this._filterMarkerSet(nestedSet, camX, camZ, viewRadius);
            }
        }

        if (setData.markers) {
            filtered.markers = {};
            for (const [id, marker] of Object.entries(setData.markers)) {
                const pos = marker.position;
                if (!pos || (
                    Math.abs((pos.x || 0) - camX) <= viewRadius &&
                    Math.abs((pos.z || 0) - camZ) <= viewRadius
                )) {
                    filtered.markers[id] = marker;
                }
            }
        }

        return filtered;
    }

}
