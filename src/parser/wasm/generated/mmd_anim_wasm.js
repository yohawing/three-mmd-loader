/* @ts-self-types="./mmd_anim_wasm.d.ts" */

export class WasmMmdClip {
    static __wrap(ptr) {
        const obj = Object.create(WasmMmdClip.prototype);
        obj.__wbg_ptr = ptr;
        WasmMmdClipFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmMmdClipFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmmmdclip_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    firstFrame() {
        const ret = wasm.wasmmmdclip_firstFrame(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {WasmMmdModel} model
     * @param {Uint8Array} data
     * @returns {WasmMmdClip}
     */
    static fromVmdBytesForModel(model, data) {
        _assertClass(model, WasmMmdModel);
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmmdclip_fromVmdBytesForModel(model.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmMmdClip.__wrap(ret[0]);
    }
    /**
     * @returns {boolean}
     */
    hasFrames() {
        const ret = wasm.wasmmmdclip_hasFrames(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    lastFrame() {
        const ret = wasm.wasmmmdclip_lastFrame(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {Uint32Array} bone_tracks_u32
     * @param {Uint32Array} bone_keyframe_frames
     * @param {Float32Array} bone_keyframe_values
     * @param {Uint32Array} morph_tracks_u32
     * @param {Uint32Array} morph_keyframe_frames
     * @param {Float32Array} morph_keyframe_weights
     * @param {Uint32Array} property_frames
     * @param {Uint8Array} property_ik_enabled
     * @param {number} property_ik_count
     */
    constructor(bone_tracks_u32, bone_keyframe_frames, bone_keyframe_values, morph_tracks_u32, morph_keyframe_frames, morph_keyframe_weights, property_frames, property_ik_enabled, property_ik_count) {
        const ptr0 = passArray32ToWasm0(bone_tracks_u32, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray32ToWasm0(bone_keyframe_frames, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayF32ToWasm0(bone_keyframe_values, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray32ToWasm0(morph_tracks_u32, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passArray32ToWasm0(morph_keyframe_frames, wasm.__wbindgen_malloc);
        const len4 = WASM_VECTOR_LEN;
        const ptr5 = passArrayF32ToWasm0(morph_keyframe_weights, wasm.__wbindgen_malloc);
        const len5 = WASM_VECTOR_LEN;
        const ptr6 = passArray32ToWasm0(property_frames, wasm.__wbindgen_malloc);
        const len6 = WASM_VECTOR_LEN;
        const ptr7 = passArray8ToWasm0(property_ik_enabled, wasm.__wbindgen_malloc);
        const len7 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmmdclip_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6, ptr7, len7, property_ik_count);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WasmMmdClipFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) WasmMmdClip.prototype[Symbol.dispose] = WasmMmdClip.prototype.free;

export class WasmMmdModel {
    static __wrap(ptr) {
        const obj = Object.create(WasmMmdModel.prototype);
        obj.__wbg_ptr = ptr;
        WasmMmdModelFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmMmdModelFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmmmdmodel_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    boneCount() {
        const ret = wasm.wasmmmdmodel_boneCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {Uint8Array} data
     * @returns {WasmMmdModel}
     */
    static fromPmxBytes(data) {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmmdmodel_fromPmxBytes(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmMmdModel.__wrap(ret[0]);
    }
    /**
     * @returns {number}
     */
    ikCount() {
        const ret = wasm.wasmmmdmodel_ikCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    morphCount() {
        const ret = wasm.wasmmmdmodel_morphCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {Int32Array} parent_indices
     * @param {Float32Array} rest_positions_xyz
     */
    constructor(parent_indices, rest_positions_xyz) {
        const ptr0 = passArray32ToWasm0(parent_indices, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(rest_positions_xyz, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmmdmodel_new(ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WasmMmdModelFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {Int32Array} parent_indices
     * @param {Float32Array} rest_positions_xyz
     * @param {Uint32Array} append_u32
     * @param {Float32Array} append_ratios
     * @returns {WasmMmdModel}
     */
    static withAppend(parent_indices, rest_positions_xyz, append_u32, append_ratios) {
        const ptr0 = passArray32ToWasm0(parent_indices, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(rest_positions_xyz, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray32ToWasm0(append_u32, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArrayF32ToWasm0(append_ratios, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmmdmodel_withAppend(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmMmdModel.__wrap(ret[0]);
    }
    /**
     * @param {Int32Array} parent_indices
     * @param {Float32Array} rest_positions_xyz
     * @param {Float32Array} inverse_bind_matrices
     * @param {Uint32Array} append_u32
     * @param {Float32Array} append_ratios
     * @returns {WasmMmdModel}
     */
    static withAppendAndInverseBind(parent_indices, rest_positions_xyz, inverse_bind_matrices, append_u32, append_ratios) {
        const ptr0 = passArray32ToWasm0(parent_indices, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(rest_positions_xyz, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayF32ToWasm0(inverse_bind_matrices, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray32ToWasm0(append_u32, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passArrayF32ToWasm0(append_ratios, wasm.__wbindgen_malloc);
        const len4 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmmdmodel_withAppendAndInverseBind(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmMmdModel.__wrap(ret[0]);
    }
    /**
     * @param {Int32Array} parent_indices
     * @param {Float32Array} rest_positions_xyz
     * @param {Float32Array} inverse_bind_matrices
     * @param {Uint32Array} ik_solvers_u32
     * @param {Float32Array} ik_solver_limit_angles
     * @param {Uint32Array} ik_links_u32
     * @param {Float32Array} ik_link_limits
     * @param {Uint32Array} append_u32
     * @param {Float32Array} append_ratios
     * @returns {WasmMmdModel}
     */
    static withFull(parent_indices, rest_positions_xyz, inverse_bind_matrices, ik_solvers_u32, ik_solver_limit_angles, ik_links_u32, ik_link_limits, append_u32, append_ratios) {
        const ptr0 = passArray32ToWasm0(parent_indices, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(rest_positions_xyz, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayF32ToWasm0(inverse_bind_matrices, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray32ToWasm0(ik_solvers_u32, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passArrayF32ToWasm0(ik_solver_limit_angles, wasm.__wbindgen_malloc);
        const len4 = WASM_VECTOR_LEN;
        const ptr5 = passArray32ToWasm0(ik_links_u32, wasm.__wbindgen_malloc);
        const len5 = WASM_VECTOR_LEN;
        const ptr6 = passArrayF32ToWasm0(ik_link_limits, wasm.__wbindgen_malloc);
        const len6 = WASM_VECTOR_LEN;
        const ptr7 = passArray32ToWasm0(append_u32, wasm.__wbindgen_malloc);
        const len7 = WASM_VECTOR_LEN;
        const ptr8 = passArrayF32ToWasm0(append_ratios, wasm.__wbindgen_malloc);
        const len8 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmmdmodel_withFull(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6, ptr7, len7, ptr8, len8);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmMmdModel.__wrap(ret[0]);
    }
    /**
     * @param {Int32Array} parent_indices
     * @param {Float32Array} rest_positions_xyz
     * @param {Float32Array} inverse_bind_matrices
     * @param {Int32Array} transform_orders
     * @param {Uint32Array} ik_solvers_u32
     * @param {Float32Array} ik_solver_limit_angles
     * @param {Uint32Array} ik_links_u32
     * @param {Float32Array} ik_link_limits
     * @param {Uint32Array} append_u32
     * @param {Float32Array} append_ratios
     * @returns {WasmMmdModel}
     */
    static withFullAndTransformOrder(parent_indices, rest_positions_xyz, inverse_bind_matrices, transform_orders, ik_solvers_u32, ik_solver_limit_angles, ik_links_u32, ik_link_limits, append_u32, append_ratios) {
        const ptr0 = passArray32ToWasm0(parent_indices, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(rest_positions_xyz, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayF32ToWasm0(inverse_bind_matrices, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray32ToWasm0(transform_orders, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passArray32ToWasm0(ik_solvers_u32, wasm.__wbindgen_malloc);
        const len4 = WASM_VECTOR_LEN;
        const ptr5 = passArrayF32ToWasm0(ik_solver_limit_angles, wasm.__wbindgen_malloc);
        const len5 = WASM_VECTOR_LEN;
        const ptr6 = passArray32ToWasm0(ik_links_u32, wasm.__wbindgen_malloc);
        const len6 = WASM_VECTOR_LEN;
        const ptr7 = passArrayF32ToWasm0(ik_link_limits, wasm.__wbindgen_malloc);
        const len7 = WASM_VECTOR_LEN;
        const ptr8 = passArray32ToWasm0(append_u32, wasm.__wbindgen_malloc);
        const len8 = WASM_VECTOR_LEN;
        const ptr9 = passArrayF32ToWasm0(append_ratios, wasm.__wbindgen_malloc);
        const len9 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmmdmodel_withFullAndTransformOrder(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6, ptr7, len7, ptr8, len8, ptr9, len9);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmMmdModel.__wrap(ret[0]);
    }
    /**
     * @param {Int32Array} parent_indices
     * @param {Float32Array} rest_positions_xyz
     * @param {Uint32Array} ik_solvers_u32
     * @param {Float32Array} ik_solver_limit_angles
     * @param {Uint32Array} ik_links_u32
     * @param {Float32Array} ik_link_limits
     * @returns {WasmMmdModel}
     */
    static withIk(parent_indices, rest_positions_xyz, ik_solvers_u32, ik_solver_limit_angles, ik_links_u32, ik_link_limits) {
        const ptr0 = passArray32ToWasm0(parent_indices, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(rest_positions_xyz, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray32ToWasm0(ik_solvers_u32, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArrayF32ToWasm0(ik_solver_limit_angles, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passArray32ToWasm0(ik_links_u32, wasm.__wbindgen_malloc);
        const len4 = WASM_VECTOR_LEN;
        const ptr5 = passArrayF32ToWasm0(ik_link_limits, wasm.__wbindgen_malloc);
        const len5 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmmdmodel_withIk(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmMmdModel.__wrap(ret[0]);
    }
    /**
     * @param {Int32Array} parent_indices
     * @param {Float32Array} rest_positions_xyz
     * @param {Float32Array} inverse_bind_matrices
     * @returns {WasmMmdModel}
     */
    static withInverseBind(parent_indices, rest_positions_xyz, inverse_bind_matrices) {
        const ptr0 = passArray32ToWasm0(parent_indices, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(rest_positions_xyz, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayF32ToWasm0(inverse_bind_matrices, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmmdmodel_withInverseBind(ptr0, len0, ptr1, len1, ptr2, len2);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmMmdModel.__wrap(ret[0]);
    }
    /**
     * @param {Int32Array} parent_indices
     * @param {Float32Array} rest_positions_xyz
     * @param {Float32Array} inverse_bind_matrices
     * @param {Int32Array} transform_orders
     * @param {Uint32Array} ik_solvers_u32
     * @param {Float32Array} ik_solver_limit_angles
     * @param {Uint32Array} ik_links_u32
     * @param {Float32Array} ik_link_limits
     * @param {Uint32Array} append_u32
     * @param {Float32Array} append_ratios
     * @param {number} morph_count
     * @param {Uint32Array} bone_morph_u32
     * @param {Float32Array} bone_morph_f32
     * @param {Uint32Array} group_morph_u32
     * @param {Float32Array} group_morph_ratios
     * @returns {WasmMmdModel}
     */
    static withMorphs(parent_indices, rest_positions_xyz, inverse_bind_matrices, transform_orders, ik_solvers_u32, ik_solver_limit_angles, ik_links_u32, ik_link_limits, append_u32, append_ratios, morph_count, bone_morph_u32, bone_morph_f32, group_morph_u32, group_morph_ratios) {
        const ptr0 = passArray32ToWasm0(parent_indices, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(rest_positions_xyz, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayF32ToWasm0(inverse_bind_matrices, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray32ToWasm0(transform_orders, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passArray32ToWasm0(ik_solvers_u32, wasm.__wbindgen_malloc);
        const len4 = WASM_VECTOR_LEN;
        const ptr5 = passArrayF32ToWasm0(ik_solver_limit_angles, wasm.__wbindgen_malloc);
        const len5 = WASM_VECTOR_LEN;
        const ptr6 = passArray32ToWasm0(ik_links_u32, wasm.__wbindgen_malloc);
        const len6 = WASM_VECTOR_LEN;
        const ptr7 = passArrayF32ToWasm0(ik_link_limits, wasm.__wbindgen_malloc);
        const len7 = WASM_VECTOR_LEN;
        const ptr8 = passArray32ToWasm0(append_u32, wasm.__wbindgen_malloc);
        const len8 = WASM_VECTOR_LEN;
        const ptr9 = passArrayF32ToWasm0(append_ratios, wasm.__wbindgen_malloc);
        const len9 = WASM_VECTOR_LEN;
        const ptr10 = passArray32ToWasm0(bone_morph_u32, wasm.__wbindgen_malloc);
        const len10 = WASM_VECTOR_LEN;
        const ptr11 = passArrayF32ToWasm0(bone_morph_f32, wasm.__wbindgen_malloc);
        const len11 = WASM_VECTOR_LEN;
        const ptr12 = passArray32ToWasm0(group_morph_u32, wasm.__wbindgen_malloc);
        const len12 = WASM_VECTOR_LEN;
        const ptr13 = passArrayF32ToWasm0(group_morph_ratios, wasm.__wbindgen_malloc);
        const len13 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmmdmodel_withMorphs(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6, ptr7, len7, ptr8, len8, ptr9, len9, morph_count, ptr10, len10, ptr11, len11, ptr12, len12, ptr13, len13);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmMmdModel.__wrap(ret[0]);
    }
}
if (Symbol.dispose) WasmMmdModel.prototype[Symbol.dispose] = WasmMmdModel.prototype.free;

export class WasmMmdRuntimeInstance {
    static __wrap(ptr) {
        const obj = Object.create(WasmMmdRuntimeInstance.prototype);
        obj.__wbg_ptr = ptr;
        WasmMmdRuntimeInstanceFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmMmdRuntimeInstanceFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmmmdruntimeinstance_free(ptr, 0);
    }
    /**
     * @param {Uint8Array} out
     * @returns {boolean}
     */
    copyIkEnabled(out) {
        var ptr0 = passArray8ToWasm0(out, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmmdruntimeinstance_copyIkEnabled(this.__wbg_ptr, ptr0, len0, out);
        return ret !== 0;
    }
    /**
     * @param {Float32Array} out
     * @returns {boolean}
     */
    copyMorphWeights(out) {
        var ptr0 = passArrayF32ToWasm0(out, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmmdruntimeinstance_copyMorphWeights(this.__wbg_ptr, ptr0, len0, out);
        return ret !== 0;
    }
    /**
     * @param {Float32Array} out
     * @returns {boolean}
     */
    copySkinningMatrices(out) {
        var ptr0 = passArrayF32ToWasm0(out, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmmdruntimeinstance_copySkinningMatrices(this.__wbg_ptr, ptr0, len0, out);
        return ret !== 0;
    }
    /**
     * @param {Float32Array} out
     * @returns {boolean}
     */
    copyWorldMatrices(out) {
        var ptr0 = passArrayF32ToWasm0(out, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmmmdruntimeinstance_copyWorldMatrices(this.__wbg_ptr, ptr0, len0, out);
        return ret !== 0;
    }
    /**
     * @param {WasmMmdClip} clip
     * @param {number} frame
     */
    evaluateClipFrame(clip, frame) {
        _assertClass(clip, WasmMmdClip);
        wasm.wasmmmdruntimeinstance_evaluateClipFrame(this.__wbg_ptr, clip.__wbg_ptr, frame);
    }
    evaluateRestPose() {
        wasm.wasmmmdruntimeinstance_evaluateRestPose(this.__wbg_ptr);
    }
    /**
     * @param {WasmMmdModel} model
     * @returns {WasmMmdRuntimeInstance}
     */
    static forModel(model) {
        _assertClass(model, WasmMmdModel);
        const ret = wasm.wasmmmdruntimeinstance_forModel(model.__wbg_ptr);
        return WasmMmdRuntimeInstance.__wrap(ret);
    }
    /**
     * @returns {Uint8Array}
     */
    ikEnabled() {
        const ret = wasm.wasmmmdruntimeinstance_ikEnabled(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {number}
     */
    ikEnabledLen() {
        const ret = wasm.wasmmmdruntimeinstance_ikEnabledLen(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Direct typed-array view over the internal IK-enabled cache.
     * Subject to the same invalidation contract as `worldMatricesView`.
     * @returns {Uint8Array}
     */
    ikEnabledView() {
        const ret = wasm.wasmmmdruntimeinstance_ikEnabledView(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    morphWeightLen() {
        const ret = wasm.wasmmmdruntimeinstance_morphWeightLen(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {Float32Array}
     */
    morphWeights() {
        const ret = wasm.wasmmmdruntimeinstance_morphWeights(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Direct typed-array view over the internal morph-weights cache.
     * Subject to the same invalidation contract as `worldMatricesView`.
     * @returns {Float32Array}
     */
    morphWeightsView() {
        const ret = wasm.wasmmmdruntimeinstance_morphWeightsView(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {WasmMmdModel} model
     * @param {number} morph_count
     */
    constructor(model, morph_count) {
        _assertClass(model, WasmMmdModel);
        const ret = wasm.wasmmmdruntimeinstance_new(model.__wbg_ptr, morph_count);
        this.__wbg_ptr = ret;
        WasmMmdRuntimeInstanceFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {Float32Array}
     */
    skinningMatrices() {
        const ret = wasm.wasmmmdruntimeinstance_skinningMatrices(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Direct typed-array view over the internal skinning-matrices cache.
     * Subject to the same invalidation contract as `worldMatricesView`.
     * @returns {Float32Array}
     */
    skinningMatricesView() {
        const ret = wasm.wasmmmdruntimeinstance_skinningMatricesView(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    skinningMatrixF32Len() {
        const ret = wasm.wasmmmdruntimeinstance_skinningMatrixF32Len(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {WasmMmdModel} model
     * @param {number} morph_count
     * @param {number} ik_count
     * @returns {WasmMmdRuntimeInstance}
     */
    static withCounts(model, morph_count, ik_count) {
        _assertClass(model, WasmMmdModel);
        const ret = wasm.wasmmmdruntimeinstance_withCounts(model.__wbg_ptr, morph_count, ik_count);
        return WasmMmdRuntimeInstance.__wrap(ret);
    }
    /**
     * @returns {Float32Array}
     */
    worldMatrices() {
        const ret = wasm.wasmmmdruntimeinstance_worldMatrices(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Direct typed-array view over the internal world-matrices cache.
     *
     * **Caution**: The returned `Float32Array` is invalidated by the next
     * evaluation call (`evaluateRestPose` / `evaluateClipFrame`) and may be
     * invalidated by Wasm memory growth. Callers that need persistent buffers
     * should use `worldMatrices()` (copy) or `copyWorldMatrices()` instead.
     * @returns {Float32Array}
     */
    worldMatricesView() {
        const ret = wasm.wasmmmdruntimeinstance_worldMatricesView(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    worldMatrixF32Len() {
        const ret = wasm.wasmmmdruntimeinstance_worldMatrixF32Len(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) WasmMmdRuntimeInstance.prototype[Symbol.dispose] = WasmMmdRuntimeInstance.prototype.free;

/**
 * @param {Uint8Array} data
 * @param {string | null} [file_name]
 * @returns {Uint8Array}
 */
export function exportAccessoryManifestBytes(data, file_name) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    var ptr1 = isLikeNone(file_name) ? 0 : passStringToWasm0(file_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    const ret = wasm.exportAccessoryManifestBytes(ptr0, len0, ptr1, len1);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v3;
}

/**
 * @param {Uint8Array} data
 * @param {string | null} [file_name]
 * @returns {Uint8Array}
 */
export function exportMmdFormatBytes(data, file_name) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    var ptr1 = isLikeNone(file_name) ? 0 : passStringToWasm0(file_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    const ret = wasm.exportMmdFormatBytes(ptr0, len0, ptr1, len1);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v3;
}

/**
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
export function exportPmdModelBytes(data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.exportPmdModelBytes(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * @param {string} json
 * @returns {Uint8Array}
 */
export function exportPmdModelJsonBytes(json) {
    const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.exportPmdModelJsonBytes(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * @param {string} metadata_json
 * @param {Float32Array} positions_xyz
 * @param {Float32Array} normals_xyz
 * @param {Float32Array} uvs_xy
 * @param {Uint32Array} indices
 * @param {Uint32Array} skin_indices
 * @param {Float32Array} skin_weights
 * @param {Float32Array} edge_scale
 * @returns {Uint8Array}
 */
export function exportPmxFromParts(metadata_json, positions_xyz, normals_xyz, uvs_xy, indices, skin_indices, skin_weights, edge_scale) {
    const ptr0 = passStringToWasm0(metadata_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF32ToWasm0(positions_xyz, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArrayF32ToWasm0(normals_xyz, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArrayF32ToWasm0(uvs_xy, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ptr4 = passArray32ToWasm0(indices, wasm.__wbindgen_malloc);
    const len4 = WASM_VECTOR_LEN;
    const ptr5 = passArray32ToWasm0(skin_indices, wasm.__wbindgen_malloc);
    const len5 = WASM_VECTOR_LEN;
    const ptr6 = passArrayF32ToWasm0(skin_weights, wasm.__wbindgen_malloc);
    const len6 = WASM_VECTOR_LEN;
    const ptr7 = passArrayF32ToWasm0(edge_scale, wasm.__wbindgen_malloc);
    const len7 = WASM_VECTOR_LEN;
    const ret = wasm.exportPmxFromParts(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6, ptr7, len7);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v9 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v9;
}

/**
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
export function exportPmxModelBytes(data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.exportPmxModelBytes(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * @param {string} json
 * @returns {Uint8Array}
 */
export function exportPmxModelJsonBytes(json) {
    const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.exportPmxModelJsonBytes(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
export function exportVmdAnimationBytes(data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.exportVmdAnimationBytes(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * @param {string} json
 * @returns {Uint8Array}
 */
export function exportVmdAnimationJsonBytes(json) {
    const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.exportVmdAnimationJsonBytes(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
export function exportVpdPoseBytes(data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.exportVpdPoseBytes(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * @param {string} json
 * @returns {Uint8Array}
 */
export function exportVpdPoseJsonBytes(json) {
    const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.exportVpdPoseJsonBytes(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * @param {Uint8Array} data
 * @param {string | null} [file_name]
 * @returns {string}
 */
export function parseMmdFormatJson(data, file_name) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(file_name) ? 0 : passStringToWasm0(file_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.parseMmdFormatJson(ptr0, len0, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * @param {Uint8Array} data
 * @returns {string}
 */
export function parsePmxModelJson(data) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.parsePmxModelJson(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * @returns {number}
 */
export function wasm_wrapper_version() {
    const ret = wasm.wasm_wrapper_version();
    return ret >>> 0;
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_copy_to_typed_array_7a3f7b938f93cf12: function(arg0, arg1, arg2) {
            new Uint8Array(arg2.buffer, arg2.byteOffset, arg2.byteLength).set(getArrayU8FromWasm0(arg0, arg1));
        },
        __wbg___wbindgen_throw_1506f2235d1bdba0: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(F32)) -> NamedExternref("Float32Array")`.
            const ret = getArrayF32FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./mmd_anim_wasm_bg.js": import0,
    };
}

const WasmMmdClipFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmmmdclip_free(ptr, 1));
const WasmMmdModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmmmdmodel_free(ptr, 1));
const WasmMmdRuntimeInstanceFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmmmdruntimeinstance_free(ptr, 1));

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat32ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('mmd_anim_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
