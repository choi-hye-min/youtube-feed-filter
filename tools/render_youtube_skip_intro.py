from pathlib import Path
import math
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / 'dist'
OUT_DIR.mkdir(exist_ok=True)

VIDEO_PATH = OUT_DIR / 'youtube_skip_service_intro_60s.mp4'
THUMB_PATH = OUT_DIR / 'youtube_skip_service_intro_thumbnail.jpg'

FFMPEG = (
    ROOT.parent.parent
    / '.cache'
    / 'codex-runtimes'
    / 'codex-primary-runtime'
    / 'dependencies'
    / 'python'
    / 'Lib'
    / 'site-packages'
    / 'imageio_ffmpeg'
    / 'binaries'
    / 'ffmpeg-win-x86_64-v7.1.exe'
)

W, H = 1920, 1080
FPS = 24
DURATION = 60

FONT_REGULAR = 'C:/Windows/Fonts/malgun.ttf'
FONT_BOLD = 'C:/Windows/Fonts/malgunbd.ttf'

RED = (255, 0, 18)
WHITE = (248, 248, 248)
MUTED = (196, 196, 196)
GREEN = (48, 205, 89)


def font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size)


ASSETS = {
    'hero': ROOT / 'assets' / 'youtube_skip_promo_marquee.jpg',
    'overview': ROOT / 'assets' / 'youtube_skip_promo_2.jpg',
    'steps': ROOT / 'assets' / 'youtube_skip_promo_3.jpg',
    'popup': ROOT / 'assets' / 'youtube_skip_promo_1.jpg',
}

IMAGES = {key: Image.open(path).convert('RGB') for key, path in ASSETS.items()}

SCENES = [
    (0, 6, 'hero', '오래된 추천 영상,\n아직도 직접 숨기고 있나요?', '유튜브 추천 피드를 더 깔끔하게'),
    (6, 14, 'overview', 'YOUTUBE SKIP', '업로드 날짜를 기준으로 오래된 추천 영상을 자동으로 관심없음 처리합니다.'),
    (14, 24, 'steps', '3단계로 시작', '팝업 열기 → 기간 선택 → 페이지별 필터 켜기'),
    (24, 34, 'popup', '원하는 기준만 선택', '1일, 1주, 1개월, 3개월, 6개월까지 유연하게 설정하세요.'),
    (34, 44, 'overview', 'HOME + WATCH 지원', '메인 피드와 시청 페이지 추천을 각각 독립적으로 정리합니다.'),
    (44, 54, 'overview', '처리 이유까지 표시', '제목, 업로드 시점, 적용 기준을 남겨 투명하게 확인할 수 있습니다.'),
    (54, 60, 'hero', '더 깔끔한 유튜브 추천 피드', 'YOUTUBE SKIP으로 직접 정리하는 시간을 줄여보세요.'),
]

CAPTIONS = [
    (0, 6, '오래된 추천 영상, 아직도 직접 숨기고 있나요?'),
    (6, 14, 'YOUTUBE SKIP은 오래된 추천 영상을 자동으로 관심없음 처리합니다.'),
    (14, 24, '팝업을 열고, 기간을 선택하고, 필요한 페이지 필터를 켜세요.'),
    (24, 34, '1일에서 6개월까지 원하는 시간 기준을 선택할 수 있습니다.'),
    (34, 44, '메인 피드와 시청 페이지 추천을 각각 독립적으로 관리합니다.'),
    (44, 54, '처리된 영상은 제목과 이유가 표시되어 결과를 바로 확인할 수 있습니다.'),
    (54, 60, 'YOUTUBE SKIP. 더 깔끔한 유튜브 추천 피드.'),
]


def ease(x):
    x = max(0, min(1, x))
    return x * x * (3 - 2 * x)


def cover(img, scale=1.0, x_bias=0.5, y_bias=0.5):
    iw, ih = img.size
    s = max(W / iw, H / ih) * scale
    nw, nh = int(iw * s), int(ih * s)
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    left = int((nw - W) * x_bias)
    top = int((nh - H) * y_bias)
    return resized.crop((left, top, left + W, top + H))


def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def scene_at(t):
    for scene in SCENES:
        if scene[0] <= t < scene[1]:
            return scene
    return SCENES[-1]


def caption_at(t):
    for start, end, text in CAPTIONS:
        if start <= t < end:
            return text
    return CAPTIONS[-1][2]


def draw_brand(draw):
    rounded(draw, (72, 54, 144, 126), 18, (*RED, 255))
    draw.polygon([(103, 77), (103, 103), (126, 90)], fill=WHITE)
    draw.text((166, 66), 'YOUTUBE ', font=font(39, True), fill=WHITE)
    draw.text((382, 66), 'SKIP', font=font(39, True), fill=RED)


def draw_text_block(draw, x, y, title, subtitle):
    title_font = font(76, True)
    sub_font = font(34)
    lines = title.split('\n')
    for idx, line in enumerate(lines):
        color = RED if ('자동' in line or 'YOUTUBE SKIP' in line or '3단계' in line) else WHITE
        draw.text((x, y + idx * 92), line, font=title_font, fill=color)
    draw.text((x, y + len(lines) * 92 + 28), subtitle, font=sub_font, fill=MUTED)


def draw_caption(draw, text):
    caption_font = font(34, True)
    box = (190, H - 138, W - 190, H - 44)
    rounded(draw, box, 22, (0, 0, 0, 190), (255, 255, 255, 40), 1)
    bbox = draw.textbbox((0, 0), text, font=caption_font)
    draw.text(((W - (bbox[2] - bbox[0])) / 2, H - 112), text, font=caption_font, fill=WHITE)


def draw_stats(draw):
    x, y = 1320, 735
    rounded(draw, (x, y, x + 236, y + 132), 16, (18, 18, 20, 225), (255, 255, 255, 45), 2)
    rounded(draw, (x + 260, y, x + 496, y + 132), 16, (18, 18, 20, 225), (255, 255, 255, 45), 2)
    draw.text((x + 28, y + 24), 'DETECTED', font=font(24, True), fill=MUTED)
    draw.text((x + 28, y + 60), '47', font=font(54, True), fill=WHITE)
    draw.text((x + 288, y + 24), 'SKIPPED', font=font(24, True), fill=MUTED)
    draw.text((x + 288, y + 60), '23', font=font(54, True), fill=RED)


def render_frame(frame_idx):
    t = frame_idx / FPS
    start, end, key, title, subtitle = scene_at(t)
    local = (t - start) / (end - start)
    zoom = 1.04 + 0.035 * ease(local)
    x_bias = 0.5 + 0.035 * math.sin((t + len(key)) * 0.31)

    frame = cover(IMAGES[key], scale=zoom, x_bias=x_bias).convert('RGBA')
    frame = Image.alpha_composite(frame, Image.new('RGBA', (W, H), (0, 0, 0, 105)))
    draw = ImageDraw.Draw(frame, 'RGBA')

    draw_brand(draw)
    if key in ('hero', 'popup'):
        draw_text_block(draw, 98, 260, title, subtitle)
    elif key == 'steps':
        rounded(draw, (80, 194, 1840, 870), 28, (0, 0, 0, 98), (255, 255, 255, 38), 2)
        draw_text_block(draw, 110, 232, title, subtitle)
    else:
        rounded(draw, (84, 176, 1040, 418), 24, (0, 0, 0, 132), (255, 0, 18, 82), 2)
        draw_text_block(draw, 116, 214, title, subtitle)

    if 34 <= t < 54:
        draw_stats(draw)

    if 44 <= t < 54:
        x, y = 1080, 520
        rounded(draw, (x, y, x + 700, y + 190), 18, (70, 0, 4, 188), (255, 0, 18, 160), 3)
        draw.text((x + 52, y + 38), '관심없음', font=font(42, True), fill=RED)
        draw.text((x + 52, y + 94), '오래된 추천 영상', font=font(32, True), fill=WHITE)
        draw.text((x + 52, y + 138), '업로드: 1개월 전 / 기준: 4 Days 이상', font=font(25), fill=MUTED)

    if 54 <= t:
        rounded(draw, (98, 540, 720, 636), 28, (*RED, 210))
        draw.text((138, 562), 'HOME + WATCH', font=font(44, True), fill=WHITE)
        rounded(draw, (98, 666, 534, 744), 22, (*GREEN, 205))
        draw.text((138, 684), 'ACTIVE', font=font(34, True), fill=WHITE)

    draw.rectangle((0, H - 8, int(W * (t / DURATION)), H), fill=RED)
    draw_caption(draw, caption_at(t))
    return np.asarray(frame.convert('RGB'))


def save_thumbnail():
    thumb = cover(IMAGES['hero'], scale=1.08).convert('RGBA')
    thumb = Image.alpha_composite(thumb, Image.new('RGBA', (W, H), (0, 0, 0, 105)))
    draw = ImageDraw.Draw(thumb, 'RGBA')
    draw_brand(draw)
    draw_text_block(draw, 98, 292, '오래된 추천은\n자동으로 정리', 'YOUTUBE SKIP 서비스 소개')
    thumb.convert('RGB').save(THUMB_PATH, quality=92)


def main():
    if not FFMPEG.exists():
        raise FileNotFoundError(f'ffmpeg not found: {FFMPEG}')

    cmd = [
        str(FFMPEG),
        '-y',
        '-f', 'rawvideo',
        '-vcodec', 'rawvideo',
        '-pix_fmt', 'rgb24',
        '-s', f'{W}x{H}',
        '-r', str(FPS),
        '-i', '-',
        '-an',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'medium',
        '-crf', '18',
        '-movflags', '+faststart',
        str(VIDEO_PATH),
    ]

    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    try:
        for frame_idx in range(FPS * DURATION):
            proc.stdin.write(render_frame(frame_idx).tobytes())
    finally:
        proc.stdin.close()
        return_code = proc.wait()

    if return_code != 0:
        raise RuntimeError(f'ffmpeg failed with exit code {return_code}')

    save_thumbnail()
    print(VIDEO_PATH)
    print(THUMB_PATH)


if __name__ == '__main__':
    main()
