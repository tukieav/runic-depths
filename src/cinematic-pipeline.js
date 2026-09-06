import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const vertexShader = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const OcclusionShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    texel: { value: new THREE.Vector2() },
  },
  vertexShader,
  fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform vec2 texel; varying vec2 vUv;
  void main(){
    vec4 scene=texture2D(tDiffuse,vUv); float depth=texture2D(tDepth,vUv).r;
    float occlusion=0.;
    for(int i=0;i<8;i++){
      float angle=float(i)*.78539816;
      vec2 offset=vec2(cos(angle),sin(angle))*texel*(3.+float(i%3)*2.);
      float other=texture2D(tDepth,vUv+offset).r;
      float delta=depth-other;
      occlusion+=smoothstep(.0007,.006,delta)*(1.-smoothstep(.014,.035,delta));
    }
    scene.rgb*=1.-occlusion*.038;
    gl_FragColor=scene;
  }`,
};
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, intensity: { value: 1 } },
  vertexShader,
  fragmentShader: `uniform sampler2D tDiffuse;uniform float intensity;varying vec2 vUv;
  void main(){
    vec4 scene=texture2D(tDiffuse,vUv);float light=dot(scene.rgb,vec3(.2126,.7152,.0722));
    vec3 tone=mix(vec3(.87,.96,1.075),vec3(1.055,1.01,.94),smoothstep(.08,1.5,light));
    scene.rgb=mix(vec3(light),scene.rgb,1.04)*tone;
    vec2 p=(vUv-.5)*1.3;float vignette=1.-smoothstep(.2,.75,dot(p,p))*.24;
    scene.rgb*=mix(1.,vignette,intensity);gl_FragColor=scene;
  }`,
};

/** HDR lighting, contact shading and color treatment, with a direct-render
 * performance mode. No external textures or network requests are involved. */
export class CinematicPipeline {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = true;
    this.supported = renderer.extensions.has('EXT_color_buffer_float');
    this.reason = this.supported ? '' : 'HDR color buffers unavailable; direct rendering';
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: this.supported ? THREE.HalfFloatType : THREE.UnsignedByteType,
      depthBuffer: true,
    });
    target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.composer = new EffectComposer(renderer, target);
    this.scenePass = new RenderPass(scene, camera);
    this.occlusion = new ShaderPass(OcclusionShader);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.38, 0.55, 1.3);
    this.grade = new ShaderPass(GradeShader);
    this.output = new OutputPass();
    this.fxaa = new ShaderPass(FXAAShader);
    for (const pass of [
      this.scenePass,
      this.occlusion,
      this.bloom,
      this.grade,
      this.output,
      this.fxaa,
    ])
      this.composer.addPass(pass);
    this.width = this.height = 1;
    this.pixelRatio = 1;
  }
  resize(width, height, pixelRatio) {
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.occlusion.uniforms.texel.value.set(1 / (width * pixelRatio), 1 / (height * pixelRatio));
    this.fxaa.uniforms.resolution.value.copy(this.occlusion.uniforms.texel.value);
  }
  render(dt) {
    if (!this.enabled || !this.supported) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.occlusion.uniforms.tDepth.value = this.composer.readBuffer.depthTexture;
    this.composer.render(dt);
  }
  status() {
    return {
      enabled: this.enabled && this.supported,
      quality: this.enabled && this.supported ? 'high' : 'low',
      passes:
        this.enabled && this.supported
          ? ['scene', 'contact-occlusion', 'hdr-bloom', 'color-grade', 'tone-map', 'fxaa']
          : ['scene'],
      width: this.width,
      height: this.height,
      pixelRatio: this.pixelRatio,
      fallbackReason: this.reason,
    };
  }
  dispose() {
    for (const pass of this.composer.passes) pass.dispose?.();
    this.composer.dispose();
  }
}
