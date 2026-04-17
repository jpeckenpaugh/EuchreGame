/// <reference types="@webgpu/types" />

import * as jspb from 'google-protobuf';

/**
 * Audio type for use in multi-modal LLM queries.
 */
declare interface Audio_2 {
    audioSource: AudioSource;
}
export { Audio_2 as Audio }

declare interface AudioChunk {
    audioSampleRateHz: number;
    audioSamples: Float32Array;
}

declare type AudioSource = string | AudioBuffer | AudioChunk;

/**
 * Copyright 2022 The MediaPipe Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/** Options to configure MediaPipe model loading and processing. */
declare interface BaseOptions_2 {
    /**
     * The model path to the model asset file. Only one of `modelAssetPath` or
     * `modelAssetBuffer` can be set.
     */
    modelAssetPath?: string | undefined;
    /**
     * A buffer or stream reader containing the model asset. Only one of
     * `modelAssetPath` or `modelAssetBuffer` can be set.
     */
    modelAssetBuffer?: Uint8Array | ReadableStreamDefaultReader | undefined;
    /** Overrides the default backend to use for the provided model. */
    delegate?: "CPU" | "GPU" | undefined;
}

/**
 * Resolves the files required for the MediaPipe Task APIs.
 *
 * This class verifies whether SIMD is supported in the current environment and
 * loads the SIMD files only if support is detected. The returned filesets
 * require that the Wasm files are published without renaming. If this is not
 * possible, you can invoke the MediaPipe Tasks APIs using a manually created
 * `WasmFileset`.
 */
export declare class FilesetResolver {
    /**
     * Returns whether SIMD is supported in the current environment.
     *
     * If your environment requires custom locations for the MediaPipe Wasm files,
     * you can use `isSimdSupported()` to decide whether to load the SIMD-based
     * assets. Note that for ES6 Modules, SIMD is assumed to be always supported.
     *
     * @param useModule Whether to use ES6 Modules for the Wasm files.
     * @export
     * @return Whether SIMD support was detected in the current environment.
     */
    static isSimdSupported(useModule?: boolean): Promise<boolean>;
    /**
     * Creates a fileset for the MediaPipe Audio tasks.
     *
     * @export
     * @param basePath An optional base path to specify the directory the Wasm
     *    files should be loaded from. If not specified, the Wasm files are
     *    loaded from the host's root directory.
     * @param useModule Whether to use ES6 Modules for the Wasm files.
     * @return A `WasmFileset` that can be used to initialize MediaPipe Audio
     *    tasks.
     */
    static forAudioTasks(basePath?: string, useModule?: boolean): Promise<WasmFileset>;
    /**
     * Creates a fileset for the MediaPipe GenAI tasks.
     *
     * @export
     * @param basePath An optional base path to specify the directory the Wasm
     *    files should be loaded from. If not specified, the Wasm files are
     *    loaded from the host's root directory.
     * @param useModule Whether to use ES6 Modules for the Wasm files.
     * @return A `WasmFileset` that can be used to initialize MediaPipe GenAI
     *    tasks.
     */
    static forGenAiTasks(basePath?: string, useModule?: boolean): Promise<WasmFileset>;
    /**
     * Creates a fileset for the MediaPipe Text tasks.
     *
     * @export
     * @param basePath An optional base path to specify the directory the Wasm
     *    files should be loaded from. If not specified, the Wasm files are
     *    loaded from the host's root directory.
     * @param useModule Whether to use ES6 Modules for the Wasm files.
     * @return A `WasmFileset` that can be used to initialize MediaPipe Text
     *    tasks.
     */
    static forTextTasks(basePath?: string, useModule?: boolean): Promise<WasmFileset>;
    /**
     * Creates a fileset for the MediaPipe Vision tasks.
     *
     * @export
     * @param basePath An optional base path to specify the directory the Wasm
     *    files should be loaded from. If not specified, the Wasm files are
     *    loaded from the host's root directory.
     * @param useModule Whether to use ES6 Modules for the Wasm files.
     * @return A `WasmFileset` that can be used to initialize MediaPipe Vision
     *    tasks.
     */
    static forVisionTasks(basePath?: string, useModule?: boolean): Promise<WasmFileset>;
}

/**
 * Image type for use in multi-modal LLM queries.
 */
declare interface Image_2 {
    imageSource: ImageSource;
}
export { Image_2 as Image }

declare type ImageSource = Exclude<CanvasImageSource, SVGElement> | string;

/**
 * Options to configure the model loading and processing for LLM Inference task.
 */
export declare interface LlmBaseOptions extends BaseOptions_2 {
    gpuOptions?: WebGpuOptions;
}

/**
 * Performs LLM Inference on text.
 */
export declare class LlmInference extends TaskRunner {
    readonly options: LlmInferenceGraphOptions;
    /**
     * Initializes the Wasm runtime and creates a new `LlmInference` based
     * on the provided options.
     * @export
     * @param wasmFileset A configuration object that provides the location of the
     *     Wasm binary and its loader.
     * @param llmInferenceOptions The options for LLM Inference. Note that
     *     either a path to the TFLite model or the model itself needs to be
     *     provided (via `baseOptions`).
     */
    static createFromOptions(wasmFileset: WasmFileset, llmInferenceOptions: LlmInferenceOptions): Promise<LlmInference>;
    /**
     * Initializes the Wasm runtime and creates a new `LlmInference` based
     * on the provided model asset buffer.
     * @export
     * @param wasmFileset A configuration object that provides the location of the
     *     Wasm binary and its loader.
     * @param modelAssetBuffer An array or a stream containing a binary
     *    representation of the model.
     */
    static createFromModelBuffer(wasmFileset: WasmFileset, modelAssetBuffer: Uint8Array | ReadableStreamDefaultReader): Promise<LlmInference>;
    /**
     * Initializes the Wasm runtime and creates a new `LlmInference` based
     * on the path to the model asset.
     * @export
     * @param wasmFileset A configuration object that provides the location of the
     *     Wasm binary and its loader.
     * @param modelAssetPath The path to the model asset.
     */
    static createFromModelPath(wasmFileset: WasmFileset, modelAssetPath: string): Promise<LlmInference>;
    private constructor();
    /**
     * Create WebGPU device with high performance configurations.
     * @export
     */
    static createWebGpuDevice(): Promise<GPUDevice>;
    /**
     * Sets new options for the LLM inference task.
     *
     * Calling `setOptions()` with a subset of options only affects those options.
     * You can reset an option back to its default value by explicitly setting it
     * to `undefined`.
     *
     * @export
     * @param options The options for the LLM Inference task.
     */
    setOptions(options: LlmInferenceOptions): Promise<void>;
    /**
     * Returns whether the LlmInference instance is idle.
     *
     * @export
     */
    get isIdle(): boolean;
    /**
     * Performs LLM Inference on the provided prompt and waits
     * asynchronously for the response. Only one call to `generateResponse()` can
     * run at a time.
     *
     * @export
     * @param query The prompt to process.
     * @return The generated text result.
     */
    generateResponse(query: Prompt): Promise<string>;
    /**
     * Performs LLM Inference on the provided prompt and waits
     * asynchronously for the response. Only one call to `generateResponse()` can
     * run at a time.
     *
     * @export
     * @param query The prompt to process.
     * @param progressListener A listener that will be triggered when the task has
     *     new partial response generated.
     * @return The generated text result.
     */
    generateResponse(query: Prompt, progressListener?: ProgressListener): Promise<string>;
    /**
     * Performs LLM Inference on the provided prompt and waits
     * asynchronously for the response. Only one call to `generateResponse()` can
     * run at a time.
     *
     * @export
     * @param query The prompt to process.
     * @param loraModel The LoRA model to apply on the text generation.
     * @return The generated text result.
     */
    generateResponse(query: Prompt, loraModel?: LoraModel): Promise<string>;
    /**
     * Performs LLM Inference on the provided prompt and waits
     * asynchronously for the response. Only one call to `generateResponse()` can
     * run at a time.
     *
     * @export
     * @param query The prompt to process.
     * @param loraModel The LoRA model to apply on the text generation.
     * @param progressListener A listener that will be triggered when the task has
     *     new partial response generated.
     * @return The generated text result.
     */
    generateResponse(query: Prompt, loraModel?: LoraModel, progressListener?: ProgressListener): Promise<string>;
    /**
     * Similar to `generateResponse()` but can return multiple responses for the
     * given prompt if the task is initialized with a value for `numResponses`
     * greater than 1.
     *
     * @export
     * @param query The prompt to process.
     * @return The generated results.
     */
    generateResponses(query: Prompt): Promise<string[]>;
    /**
     * Similar to `generateResponse()` but can return multiple responses for the
     * given prompt if the task is initialized with a value for `numResponses`
     * greater than 1.
     *
     * @export
     * @param query The prompt to process.
     * @param progressListener A listener that will be triggered when the task has
     *     new partial response generated.
     * @return The generated results.
     */
    generateResponses(query: Prompt, progressListener: MultiResponseProgressListener): Promise<string[]>;
    /**
     * Similar to `generateResponse()` but can return multiple responses for the
     * given prompt if the task is initialized with a value for `numResponses`
     * greater than 1.
     *
     * @export
     * @param query The prompt to process.
     * @param loraModel The LoRA model to apply on the text generation.
     * @return The generated results.
     */
    generateResponses(query: Prompt, loraModel: LoraModel): Promise<string[]>;
    /**
     * Similar to `generateResponse()` but can return multiple responses for the
     * given prompt if the task is initialized with a value for `numResponses`
     * greater than 1.
     *
     * @export
     * @param query The prompt to process.
     * @param loraModel The LoRA model to apply on the text generation.
     * @param progressListener A listener that will be triggered when the task has
     *     new partial response generated.
     * @return The generated results.
     */
    generateResponses(query: Prompt, loraModel: LoraModel, progressListener: MultiResponseProgressListener): Promise<string[]>;
    /**
     * Runs an invocation of *only* the tokenization for the LLM, and returns
     * the size (in tokens) of the result. Cannot be called while
     * a `generateResponse()` query is active. Runs synchronously.
     *
     * @export
     * @param query The prompt to tokenize.
     * @return The number of tokens in the resulting tokenization of the text.
     *         May return undefined if an error occurred.
     */
    sizeInTokens(query: Prompt): number | undefined;
    /**
     * Sends a signal to cancel any current decoding when the engine is able to.
     * Does not cancel initialization or prefilling yet.
     * @export
     */
    cancelProcessing(): void;
    clearCancelSignals(): void;
    /**
     * Load a LoRA model to the LLM Inference Task and the LoRA model can be used
     * by `generateResponse()`. The returned LoRA model can be applied only to the
     * current LLM Inference task.
     *
     * @export
     * @param modelAsset The URL to the model, Blob or the ArrayBuffer of the
     *     model content.
     * @return A loaded LoRA model.
     */
    loadLoraModel(modelAsset: string | Uint8Array | Blob): Promise<LoraModel>;
    close(): void;
}

declare class LlmInferenceGraphOptions extends jspb.Message {
    hasBaseOptions(): boolean;
    clearBaseOptions(): void;
    getBaseOptions(): mediapipe_tasks_cc_core_proto_base_options_pb.BaseOptions | undefined;
    setBaseOptions(value?: mediapipe_tasks_cc_core_proto_base_options_pb.BaseOptions): void;
    hasMaxTokens(): boolean;
    clearMaxTokens(): void;
    getMaxTokens(): number;
    setMaxTokens(value: number): void;
    hasSamplerParams(): boolean;
    clearSamplerParams(): void;
    getSamplerParams(): mediapipe_tasks_web_genai_llm_inference_proto_sampler_params_pb.SamplerParameters | undefined;
    setSamplerParams(value?: mediapipe_tasks_web_genai_llm_inference_proto_sampler_params_pb.SamplerParameters): void;
    clearLoraRanksList(): void;
    getLoraRanksList(): Array<number>;
    setLoraRanksList(value: Array<number>): void;
    addLoraRanks(value: number, index?: number): number;
    hasNumResponses(): boolean;
    clearNumResponses(): void;
    getNumResponses(): number;
    setNumResponses(value: number): void;
    hasForceF32(): boolean;
    clearForceF32(): void;
    getForceF32(): boolean;
    setForceF32(value: boolean): void;
    hasMaxNumImages(): boolean;
    clearMaxNumImages(): void;
    getMaxNumImages(): number;
    setMaxNumImages(value: number): void;
    hasSupportAudio(): boolean;
    clearSupportAudio(): void;
    getSupportAudio(): boolean;
    setSupportAudio(value: boolean): void;
    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): LlmInferenceGraphOptions.AsObject;
    static toObject(includeInstance: boolean, msg: LlmInferenceGraphOptions): LlmInferenceGraphOptions.AsObject;
    static extensions: {
        [key: number]: jspb.ExtensionFieldInfo<jspb.Message>;
    };
    static extensionsBinary: {
        [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>;
    };
    static serializeBinaryToWriter(message: LlmInferenceGraphOptions, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): LlmInferenceGraphOptions;
    static deserializeBinaryFromReader(message: LlmInferenceGraphOptions, reader: jspb.BinaryReader): LlmInferenceGraphOptions;
}

declare namespace LlmInferenceGraphOptions {
    type AsObject = {
        baseOptions?: mediapipe_tasks_cc_core_proto_base_options_pb.BaseOptions.AsObject;
        maxTokens: number;
        samplerParams?: mediapipe_tasks_web_genai_llm_inference_proto_sampler_params_pb.SamplerParameters.AsObject;
        loraRanksList: Array<number>;
        numResponses: number;
        forceF32: boolean;
        maxNumImages: number;
        supportAudio: boolean;
    };
}

/** Options to configure the MediaPipe LLM Inference Task */
export declare interface LlmInferenceOptions extends TaskRunnerOptions {
    /** Options to configure the LLM model loading and processing. */
    baseOptions?: LlmBaseOptions;
    /**
     * Maximum number of the combined input and output tokens.
     */
    maxTokens?: number;
    /**
     * The number of candidate tokens to sample from the softmax output in top-k
     * sampling.
     */
    topK?: number;
    /**
     * The temperature used to scale the logits before computing softmax.
     */
    temperature?: number;
    /**
     * Random seed for sampling tokens.
     */
    randomSeed?: number;
    /**
     * The LoRA ranks that will be used during inference.
     */
    loraRanks?: number[];
    /**
     * The number of responses to generate for 'generateResponses' calls,
     * defaulting to 1.
     * In order to ensure variation of responses, you should set topK > 1 and
     * temperature > 0 in the task options; otherwise sampling will collapse to
     * greedy sampling, resulting in all generated responses having the same
     * results.
     * Also, note that increasing this will slow down `generateResponse` calls,
     * because it will still generate many responses, even though it only returns
     * the top result.
     */
    numResponses?: number;
    /**
     * When set to true, will force inference to be performed with F32 precision.
     * Useful for debugging F16 precision-related errors.
     */
    forceF32?: boolean;
    /**
     * When set > 0, will enable vision modality usage. Will also enable streaming
     * loading, and therefore is not compatible with "converted" models.
     */
    maxNumImages?: number;
    /**
     * When set to true, will enable audio modality usage. Will also enable
     * streaming loading, and therefore is not compatible with "converted" models.
     */
    supportAudio?: boolean;
}

/**
 * The LoRA model to be used for `generateResponse()` of a LLM Inference task.
 */
export declare class LoraModel {
    readonly owner: LlmInference;
    readonly loraModelId: number;
    constructor(owner: LlmInference);
}

declare namespace mediapipe_tasks_cc_core_proto_base_options_pb {
    export { BaseOptions };
}

declare namespace mediapipe_tasks_web_genai_llm_inference_proto_sampler_params_pb {
    export { SamplerParameters };
}

/**
 * A listener that receives the newly generated partial results for multiple
 * responses and an indication whether the generation is complete.
 */
export declare type MultiResponseProgressListener = (partialResult: string[], done: boolean) => unknown;

/**
 * A listener that receives the newly generated partial result and an indication
 * whether the generation is complete.
 */
export declare type ProgressListener = (partialResult: string, done: boolean) => unknown;

/**
 * Type for an LLM query; may be multi-modal.
 */
export declare type Prompt = PromptPart | PromptPart[];

/**
 * Type for a piece of an LLM query.
 */
declare type PromptPart = string | Image_2 | Audio_2;

/** Base class for all MediaPipe Tasks. */
declare abstract class TaskRunner {
    protected constructor();
    /** Configures the task with custom options. */
    abstract setOptions(options: TaskRunnerOptions): Promise<void>;
    /**
     * Closes and cleans up the resources held by this task.
     * @export
     */
    close(): void;
}

/** Options to configure MediaPipe Tasks in general. */
declare interface TaskRunnerOptions {
    /** Options to configure the loading of the model assets. */
    baseOptions?: BaseOptions_2;
}

/**
 * Copyright 2022 The MediaPipe Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/** An object containing the locations of the Wasm assets */
declare interface WasmFileset {
    /** The path to the Wasm loader script. */
    wasmLoaderPath: string;
    /** The path to the Wasm binary. */
    wasmBinaryPath: string;
    /** The optional path to the asset loader script. */
    assetLoaderPath?: string;
    /** The optional path to the assets binary. */
    assetBinaryPath?: string;
}

/**
 * Options to configure the WebGPU device for LLM Inference task.
 */
export declare interface WebGpuOptions {
    /**
     * The WebGPU device to perform the LLM Inference task.
     * `LlmInference.createWebGpuDevice()` provides the device with
     * performance-prioritized configurations.
     */
    device?: GPUDevice;
    /**
     * The information of WebGPU adapter, which will be used to optimize the
     * performance for LLM Inference task.
     */
    adapterInfo?: GPUAdapterInfo;
}

export { }
