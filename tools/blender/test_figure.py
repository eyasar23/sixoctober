"""Builds a low-poly test figure from primitives, exports it as GLB and renders a preview.

Run headless from the repository root:
    blender -b --factory-startup -P tools/blender/test_figure.py

Outputs:
    public/assets/test/test_figure.glb   (figure only, ~1.8 m tall, feet at the origin)
    docs/previews/test_figure.png        (Cycles CPU, 512 px)
"""

import math
import time
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
GLB_PATH = ROOT / "public" / "assets" / "test" / "test_figure.glb"
PREVIEW_PATH = ROOT / "docs" / "previews" / "test_figure.png"
PREVIEW_SIZE = 512
PREVIEW_SAMPLES = 64

# Colours from BRIEF.md section 4.1.
COLORS = {
    "hoodie": "#BC7D5F",
    "jeans": "#6E4F8F",
    "sneakers": "#E9D1A2",
    "skin": "#DFA78A",
    "hair": "#261420",
    "mode_band": "#65C4E4",
    "ground": "#735A92",
    "sky": "#38164B",
}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(hex_color):
    h = hex_color.lstrip("#")
    r, g, b = (srgb_to_linear(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4))
    return (r, g, b, 1.0)


def make_material(name, roughness=0.8, emission=0.0):
    color = hex_to_linear(COLORS[name])
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = color
    bsdf = material.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    if emission > 0:
        # Blender 4.x calls it "Emission Color"; 3.x called it "Emission".
        (bsdf.inputs.get("Emission Color") or bsdf.inputs["Emission"]).default_value = color
        bsdf.inputs["Emission Strength"].default_value = emission
    return material


def add_part(kind, material, location, size, vertices=8):
    """Adds a flat-shaded primitive. `size` is the full extent along X, Y, Z in metres."""
    if kind == "box":
        bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    elif kind == "cylinder":
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=0.5, depth=1, location=location)
    else:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=6, radius=0.5, location=location)
    part = bpy.context.active_object
    part.scale = size
    part.data.materials.append(material)
    return part


def build_figure():
    """Civilian hero stand-in: hoodie, jeans, sneakers and a hexagonal band on the left wrist.
    Blender is Z-up and the figure faces -Y, which becomes +Z (towards the camera) in three.js."""
    mat = {name: make_material(name) for name in ("hoodie", "jeans", "sneakers", "skin", "hair")}
    band = make_material("mode_band", roughness=0.3, emission=4.0)

    parts = []
    for side in (-1, 1):  # +X is the figure's left
        leg_x = 0.1 * side
        arm_x = 0.28 * side
        parts += [
            add_part("box", mat["sneakers"], (leg_x, -0.04, 0.05), (0.12, 0.28, 0.1)),
            add_part("cylinder", mat["jeans"], (leg_x, 0, 0.31), (0.14, 0.14, 0.42)),
            add_part("cylinder", mat["jeans"], (leg_x, 0, 0.73), (0.17, 0.17, 0.42)),
            add_part("cylinder", mat["hoodie"], (arm_x, 0, 1.29), (0.11, 0.11, 0.3)),
            add_part("cylinder", mat["hoodie"], (arm_x, 0, 1.0), (0.1, 0.1, 0.28)),
            add_part("box", mat["skin"], (arm_x, 0, 0.81), (0.07, 0.09, 0.1)),
        ]
    parts += [
        add_part("box", mat["jeans"], (0, 0, 0.98), (0.34, 0.2, 0.14)),
        add_part("box", mat["hoodie"], (0, 0, 1.24), (0.44, 0.24, 0.48)),
        add_part("sphere", mat["hoodie"], (0, 0.09, 1.5), (0.32, 0.2, 0.18)),  # hood
        add_part("cylinder", mat["skin"], (0, 0, 1.52), (0.1, 0.1, 0.08)),  # neck
        add_part("sphere", mat["skin"], (0, 0, 1.67), (0.22, 0.24, 0.26)),  # head
        add_part("sphere", mat["hair"], (0, 0.035, 1.73), (0.236, 0.23, 0.18)),
        add_part("cylinder", band, (0.28, 0, 0.88), (0.14, 0.14, 0.05), vertices=6),  # ModeBand
    ]

    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    figure = bpy.context.active_object
    figure.name = "TestFigure"
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return figure


def export_glb():
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
    )


def look_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_preview():
    """Adds a ground disc, lights and a camera (none of them are in the GLB) and renders with Cycles."""
    scene = bpy.context.scene
    world = bpy.data.worlds.new("PreviewWorld")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = hex_to_linear(COLORS["sky"])
    scene.world = world

    bpy.ops.mesh.primitive_circle_add(vertices=32, radius=2.5, fill_type="NGON")
    bpy.context.active_object.data.materials.append(make_material("ground", roughness=1.0))

    bpy.ops.object.light_add(type="SUN")
    sun = bpy.context.active_object
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(-35))

    bpy.ops.object.light_add(type="AREA", location=(-1.2, 1.8, 2.2))
    rim = bpy.context.active_object
    rim.data.energy = 150
    rim.data.size = 1.5
    rim.data.color = hex_to_linear(COLORS["mode_band"])[:3]
    look_at(rim, Vector((0, 0, 1.2)))

    bpy.ops.object.camera_add(location=(1.7, -3.3, 1.45))
    camera = bpy.context.active_object
    camera.data.lens = 50
    look_at(camera, Vector((0, 0, 0.92)))
    scene.camera = camera

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = PREVIEW_SAMPLES
    scene.cycles.use_denoising = False  # the Ubuntu build may lack OpenImageDenoise
    scene.render.resolution_x = PREVIEW_SIZE
    scene.render.resolution_y = PREVIEW_SIZE
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "Standard"  # keep palette colours as they are
    scene.render.image_settings.file_format = "PNG"
    PREVIEW_PATH.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(PREVIEW_PATH)
    bpy.ops.render.render(write_still=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    start = time.time()
    figure = build_figure()
    triangles = sum(len(polygon.vertices) - 2 for polygon in figure.data.polygons)
    export_glb()
    exported = time.time()
    render_preview()
    rendered = time.time()
    print(
        f"[test_figure] {triangles} triangles | GLB: {GLB_PATH.relative_to(ROOT)} "
        f"({exported - start:.1f} s) | preview: {PREVIEW_PATH.relative_to(ROOT)} ({rendered - exported:.1f} s)"
    )


main()
