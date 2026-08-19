#!/usr/bin/env python3
"""像素美術產生器（VISUAL_SPEC §6）。
每張 sprite 以 ASCII pixel map 手工定義：palette 對應字元→色碼，'.' 為透明。
輸出一律最近鄰整數放大（logical → 6x device px），無任何平滑。
用法：python3 tools_gen_sprites.py
"""
from PIL import Image
import os

SCALE = 6          # 每邏輯像素 → 6 檔案像素（32px CSS @3x = 96 device px / 16 格）

OUT = 'assets'

# 共用色
K = '#0B0A12'      # 外框深色（同 --bg-void）
W = '#F2EFFF'


def build(name, palette, rows, mirror=False):
    h = len(rows)
    w = len(rows[0]) * (2 if mirror else 1)
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(rows):
        assert len(row) == len(rows[0]), f'{name} row {y} 長度不齊'
        full = row + row[::-1] if mirror else row
        for x, ch in enumerate(full):
            if ch == '.':
                continue
            c = palette[ch]
            r, g, b = int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)
            px[x, y] = (r, g, b, 255)
    out = img.resize((w * SCALE, h * SCALE), Image.NEAREST)
    path = os.path.join(OUT, name + '.png')
    out.save(path)
    return path


# =====================================================================
# 資源圖示 16×16（顯示 32px CSS）
# =====================================================================

# 寶石（金）——菱形切面
build('res_gem', {'k': K, 'g': '#FFC24B', 'd': '#C98A1E', 'l': '#FFE9B8'}, [
    '................',
    '................',
    '....kkkkkkkk....',
    '...kllgggggdk...',
    '..klggggggggdk..',
    '.klgggggggggddk.',
    '.kgggggggggggdk.',
    '.kdgggggggggddk.',
    '..kdgggggggddk..',
    '..kddgggggdddk..',
    '...kddgggdddk...',
    '....kddgdddk....',
    '.....kdddk......',
    '......kdk.......',
    '.......k........',
    '................',
])

# 強化素材——礦石塊
build('res_material', {'k': K, 'b': '#4B9BFF', 'd': '#2A5FA8', 'l': '#B8DCFF', 's': '#8B84A3'}, [
    '................',
    '................',
    '.....kkkkk......',
    '....klbbbdk.....',
    '...klbbbbbdk....',
    '..klbblbbbbdk...',
    '..kbbbbbbdbdk...',
    '.kbblbbbbbbddk..',
    '.kbbbbbdbbbbdk..',
    '.kdbbbbbbbdddk..',
    '.kddbbdbbbdddk..',
    '..kdddbbddddk...',
    '...kdddddddk....',
    '....kkkkkkk.....',
    '................',
    '................',
])

# 金幣
build('res_gold', {'k': K, 'g': '#FFC24B', 'd': '#C98A1E', 'l': '#FFE9B8'}, [
    '................',
    '................',
    '.....kkkkkk.....',
    '....kggggggk....',
    '...kglggggggk...',
    '..kglggkkgggdk..',
    '..kglggkgggddk..',
    '..kggggkgggddk..',
    '..kggggkgggddk..',
    '..kglggkkggddk..',
    '..kggkgggkgddk..',
    '...kggkkkggdk...',
    '....kggggddk....',
    '.....kkkkkk.....',
    '................',
    '................',
])

# =====================================================================
# 標籤圖示 16×16
# =====================================================================

build('tag_spike', {'k': K, 'c': '#4B9BFF', 'l': '#B8DCFF'}, [
    '................',
    '.......k........',
    '......klk.......',
    '......kck.......',
    '..k...kck...k...',
    '.klk.kkckk.kck..',
    '..kckcccccck....',
    '...kcccccck.....',
    '..kccclcccck....',
    '..kcclccccck....',
    '...kcccccck.....',
    '..kckcccccck....',
    '.kck.kkckk.kck..',
    '..k...kck...k...',
    '......klk.......',
    '.......k........',
])

build('tag_burn', {'k': K, 'r': '#E8455F', 'o': '#FF8A3D', 'y': '#FFC24B'}, [
    '................',
    '.......k........',
    '......kok.......',
    '.....kook..k....',
    '.....koook.kk...',
    '....koooookok...',
    '....koyoooook...',
    '...koyyoooook...',
    '...koyyyoooook..',
    '..koyyyyyoook...',
    '..koyyyyyyook...',
    '..koyyyyyyook...',
    '...koyyyyook....',
    '....kyyyyok.....',
    '.....kkkkk......',
    '................',
])

build('tag_lifesteal', {'k': K, 'r': '#E8455F', 'l': '#FF9DB0'}, [
    '................',
    '................',
    '..kkkk...kkkk...',
    '.krrrrk.krrrrk..',
    'krlrrrrkrrrrrrk.',
    'krrrrrrrrrrrrrk.',
    'krrrrrrrrrrrrrk.',
    'krrrrrrrrrrrrrk.',
    '.krrrrrrrrrrrk..',
    '..krrrrrrrrrk...',
    '...krrrrrrrk....',
    '....krrrrrk.....',
    '.....krrrk......',
    '......krk.......',
    '.......k........',
    '................',
])

build('tag_crit', {'k': K, 'y': '#FFC24B', 'w': W}, [
    '................',
    '.......kk.......',
    '......kyyk......',
    '.....kyyyyk.....',
    '.kk..kyywyk..kk.',
    '.kykkkywyyykkyk.',
    '..kyyyywyyyyyk..',
    '...kyywwwyyk....',
    '....kwwwwwk.....',
    '...kyywwwyyk....',
    '..kyyyywyyyyyk..',
    '.kykkkyywyykkyk.',
    '.kk..kyyyyk..kk.',
    '.....kyyyk......',
    '......kyk.......',
    '.......k........',
])

build('tag_shield', {'k': K, 'b': '#4B9BFF', 'l': '#B8DCFF', 'd': '#2A5FA8'}, [
    '................',
    '..kkkkkkkkkkk...',
    '.klbbbbbbbbbdk..',
    '.klbbbbbbbbbdk..',
    '.klbblllbbbbdk..',
    '.klbblbbbbbbdk..',
    '.klbblbbbbbbdk..',
    '.klbbbbbbbbbdk..',
    '.kdbbbbbbbbddk..',
    '..kdbbbbbbddk...',
    '..kdbbbbbbddk...',
    '...kdbbbbddk....',
    '....kdbbddk.....',
    '.....kdddk......',
    '......kkk.......',
    '................',
])

# =====================================================================
# 裝備欄位空位圖示 16×16（單色 --text-disabled，由 CSS 染色不可行，直接畫）
# =====================================================================
D = '#4A4459'

def slot_icon(name, rows):
    build(name, {'d': D}, rows)

slot_icon('slot_character', [
    '................', '................', '......dddd......', '.....d....d.....',
    '.....d....d.....', '.....d....d.....', '......dddd......', '.......dd.......',
    '....dddddddd....', '...d........d...', '...d........d...', '...d........d...',
    '...d........d...', '...d........d...', '................', '................'])
slot_icon('slot_weapon', [
    '................', '..........dd....', '.........d..d...', '........d..d....',
    '.......d..d.....', '......d..d......', '.....d..d.......', '....d..d........',
    '...d..d.........', '..dd.d..........', '..d.d...........', '.dd.dd..........',
    'd.....d.........', '.d...d..........', '..ddd...........', '................'])
slot_icon('slot_head', [
    '................', '................', '.....dddddd.....', '....d......d....',
    '...d........d...', '...d........d...', '...d........d...', '...dddddddddd...',
    '..d..........d..', '..dddddddddddd..', '................', '................',
    '................', '................', '................', '................'])
slot_icon('slot_body', [
    '................', '................', '...dd......dd...', '..d..dddddd..d..',
    '..d..d....d..d..', '..d.d......d.d..', '..ddd......ddd..', '....d......d....',
    '....d......d....', '....d......d....', '....d......d....', '....dddddddd....',
    '................', '................', '................', '................'])
slot_icon('slot_accessory', [
    '................', '................', '......dddd......', '.....d....d.....',
    '.....d....d.....', '......dddd......', '.....d....d.....', '....d......d....',
    '...d........d...', '...d........d...', '...d........d...', '....d......d....',
    '.....dddddd.....', '................', '................', '................'])
slot_icon('slot_pet', [
    '................', '................', '...dd......dd...', '..d..d....d..d..',
    '..d...dddd...d..', '..d..........d..', '...d..........d.', '..d.....dd....d.',
    '..d....d..d...d.', '..d....d..d...d.', '...d..........d.', '....dddddddddd..',
    '......d....d....', '......d....d....', '.....dd....dd...', '................'])

# =====================================================================
# 道具圖示 16×16（顯示 64px CSS 於背包/圖鑑、32px 於列表）
# =====================================================================

# --- 普通武器 ---
build('gear_001', {'k': K, 'w': '#B48A5A', 'l': '#D9B27E', 'd': '#7A5A38'}, [  # 木劍
    '..........kk....', '.........klwk...', '........klwwk...', '.......klwwdk...',
    '......klwwdk....', '.....klwwdk.....', '....klwwdk......', '...klwwdk.......',
    '..kklwdk........', '.kwwkdk.........', '.kwwwk..........', 'kdkwwdk.........',
    'kdk.kddk........', '.k...kdk........', '......k.........', '................'])
build('gear_002', {'k': K, 's': '#B8C4D9', 'l': W, 'd': '#6E7A94', 'g': '#FFC24B'}, [  # 鐵劍
    '..........kk....', '.........klsk...', '........klssk...', '.......klssdk...',
    '......klssdk....', '.....klssdk.....', '....klssdk......', '...klssdk.......',
    '..kklsdk........', '.kggkdk.........', '.kggggk.........', 'kdkggdk.........',
    'kdk.kddk........', '.k...kdk........', '......k.........', '................'])

# --- 頭部 ---
build('gear_003', {'k': K, 'b': '#4B9BFF', 'd': '#2A5FA8', 'l': '#B8DCFF'}, [  # 布帽
    '................', '................', '......kkkk......', '....kkbbbbkk....',
    '...kbbblbbbbk...', '..kbbbblbbbbbk..', '..kbbbbbbbbbbk..', '.kbbbbbbbbbbbdk.',
    '.kddddddddddddk.', '.kbbbbbbbbbbbbdk', '..kkkkkkkkkkkk..', '................',
    '................', '................', '................', '................'])
build('gear_004', {'k': K, 's': '#8B94A8', 'l': '#C4CCDB', 'd': '#5A6478'}, [  # 鐵盔
    '................', '................', '......kkkk......', '....kklsslkk....',
    '...klssssssdk...', '..klssssssssdk..', '..ksssssssssdk..', '..ksssssssssdk..',
    '..kssdkkkkdssk..', '..kssk....kssk..', '..kddk....kddk..', '...kk......kk...',
    '................', '................', '................', '................'])

# --- 身體 ---
build('gear_005', {'k': K, 'b': '#B48A5A', 'd': '#7A5A38', 'l': '#D9B27E'}, [  # 皮甲
    '................', '................', '..kkk......kkk..', '..kbbkkkkkkbbk..',
    '.kbbbbbbbbbbbbk.', '.kbdbbbbbbbbdbk.', '.kbdblbbbblbdbk.', '..kkbbbbbbbbkk..',
    '....kbbbbbbk....', '....kbdbbdbk....', '....kbbbbbbk....', '....kbdbbdbk....',
    '....kbbbbbbk....', '....kkkkkkkk....', '................', '................'])
build('gear_006', {'k': K, 's': '#8B94A8', 'd': '#5A6478', 'l': '#C4CCDB'}, [  # 鎖子甲
    '................', '................', '..kkk......kkk..', '..ksskkkkkkssk..',
    '.kslslslslslssk.', '.ksdsdsdsdsdssk.', '.kslslslslslssk.', '..kksdsdsdskk...',
    '....kslslsk.....', '....ksdsdsk.....', '....kslslsk.....', '....ksdsdsk.....',
    '....kslslsk.....', '....kkkkkkk.....', '................', '................'])

# --- 飾品 ---
build('gear_007', {'k': K, 'c': '#D98A4B', 'd': '#9C5A24', 'l': '#FFC08A'}, [  # 銅戒指
    '................', '................', '................', '......kkkk......',
    '....kklcclkk....', '...kcck..kcck...', '...kck....kck...', '..kck......kck..',
    '..kck......kck..', '...kck....kck...', '...kdck..kcdk...', '....kkdccdkk....',
    '......kkkk......', '................', '................', '................'])
build('gear_008', {'k': K, 'r': '#D9564B', 'd': '#8A2E24', 'g': '#FFC24B'}, [  # 護身符
    '................', '......kkkk......', '.....k....k.....', '....k......k....',
    '....k......k....', '.....k....k.....', '....kkkggkkk....', '...krrkggkrrk...',
    '..krrrkkkkrrrk..', '..krrrrrrrrrdk..', '..krrrrrrrrddk..', '...krrrrrrddk...',
    '....krrrrddk....', '.....kkkkkk.....', '................', '................'])

# --- 特殊：尖刺（藍） ---
build('gear_101', {'k': K, 'g': '#4BD96A', 'd': '#2A8A42', 'l': '#A8F0B8'}, [  # 荊棘盾
    '................', '..kkkkkkkkkkk...', '.klgggggggggdk..', '.klgkggggkggdk..',
    '.klggkggkgggdk..', '.klgggkkggggdk..', '.klggkggkgggdk..', '.klgkggggkggdk..',
    '.kdgggggggggdk..', '..kdgggggggdk...', '..kdgggggggdk...', '...kdgggggdk....',
    '....kdgggdk.....', '.....kdddk......', '......kkk.......', '................'])
build('gear_102', {'k': K, 's': '#8B94A8', 'l': '#C4CCDB', 'b': '#4B9BFF', 'd': '#5A6478'}, [  # 刺蝟王之鎧
    '.....k..k..k....', '....kbkkbkkbk...', '..k.kbkkbkkbk.k.', '.kbkksslssslkbk.',
    '..kklssssssslkk.', '.kbkssssssssskbk', '..klsssssssssdk.', '.kbksssssssskbk.',
    '..klssssssssdk..', '...ksdkkkkdssk..', '...kssk..kssk...', '...kddk..kddk...',
    '....kk....kk....', '................', '................', '................'])

# --- 特殊：燒傷（火） ---
build('gear_103', {'k': K, 'w': '#B48A5A', 'd': '#7A5A38', 'o': '#FF8A3D', 'y': '#FFC24B'}, [  # 火把
    '................', '.......ko.......', '......koyk......', '.....koyok......',
    '.....koyyok.....', '....koyyyok.....', '....koyyyyok....', '.....kyyyk......',
    '......kwk.......', '......kwdk......', '......kwdk......', '......kwdk......',
    '......kwdk......', '......kddk......', '.......kk.......', '................'])
build('gear_104', {'k': K, 'r': '#E8455F', 'o': '#FF8A3D', 'y': '#FFC24B', 'd': '#8A2E24'}, [  # 熔岩之心
    '................', '................', '..kkkk...kkkk...', '.krrrrk.krrrrk..',
    'krrorrrkrrrorrk.', 'krorryrrrryrork.', 'krryoyroyoyrrdk.', 'krrryyoyyyrrrdk.',
    '.krrroyoyrrrdk..', '..krrryyrrrdk...', '...krroyrrdk....', '....krrrrdk.....',
    '.....krrdk......', '......krk.......', '.......k........', '................'])

# --- 特殊：吸血（紅） ---
build('gear_105', {'k': K, 'p': '#8B6E9C', 'd': '#5A4468', 'w': W, 'r': '#E8455F'}, [  # 蝙蝠牙
    '................', '..k..........k..', '..kk........kk..', '..kpk..kk..kpk..',
    '..kppkkppkkppk..', '..kpppppppppdk..', '.kppppppppppddk.', '.kpkpppppppkpdk.',
    '..k.kpwppwpk.k..', '.....kwkkwk.....', '.....kwk.wk.....', '.....krk.rk.....',
    '......k..k......', '................', '................', '................'])
build('gear_106', {'k': K, 'g': '#FFC24B', 'd': '#C98A1E', 'r': '#E8455F', 'l': '#FF9DB0'}, [  # 猩紅聖杯
    '................', '..kkkkkkkkkkk...', '..kgrrrrrrrgk...', '...krlrrrrrk....',
    '...krrrrrrdk....', '....krrrrdk.....', '.....krrdk......', '......kgk.......',
    '......kgk.......', '......kgk.......', '.....kggdk......', '....kggggdk.....',
    '...kggggggdk....', '...kkkkkkkkk....', '................', '................'])

# --- 特殊：暴擊（金） ---
build('gear_107', {'k': K, 'g': '#FFC24B', 'd': '#C98A1E', 'b': '#4B9BFF', 'l': '#B8DCFF'}, [  # 鷹眼鏡片
    '................', '................', '....kkkkkkkk....', '...kggggggggk...',
    '..kgkkkkkkkkgk..', '.kgk.kbbbbk.kgk.', '.kgkkblbbbdkkgk.', '.kgkbllbbbbdkgk.',
    '.kgkbbbbkbbdkgk.', '.kgkkbbbbbdkkgk.', '.kgk.kbbbdk.kgk.', '..kgkkkkkkkkgk..',
    '...kggggggggk...', '....kkkkkkkk....', '................', '................'])
build('gear_108', {'k': K, 'w': W, 'r': '#E8455F', 'd': '#8A2E24', 'y': '#FFC24B'}, [  # 弒神之瞳
    '................', '................', '.....kkkkkk.....', '...kkwwwwwwkk...',
    '..kwwwwwwwwwwk..', '.kwwwkkrrkkwwwk.', '.kwwkrrrrrrkwwk.', 'kwwkrrkyykrrkwwk',
    'kwwkrrkyykrrkwwk', '.kwwkrrrrrrkwwk.', '.kwwwkkrrkkwwwk.', '..kwwwwwwwwwwk..',
    '...kkwwwwwwkk...', '.....kkkkkk.....', '................', '................'])

# --- 特殊：護盾（藍） ---
build('gear_109', {'k': K, 'c': '#4BD9C4', 'd': '#2A8A7A', 'l': '#B8F0E8'}, [  # 龜甲護符
    '................', '................', '.....kkkkkk.....', '....klcccccdk...',
    '...klcckccccdk..', '..klcckcckcccdk.', '..kccckcckcccdk.', '..kckkkcckkkcdk.',
    '..kccckcckcccdk.', '..kdcckcckccddk.', '...kdcckccccdk..', '....kdcccccdk...',
    '.....kkkkkk.....', '................', '................', '................'])
build('gear_110', {'k': K, 'w': W, 'g': '#FFC24B', 'b': '#4B9BFF', 'l': '#B8DCFF', 'd': '#8B84A3'}, [  # 聖光壁壘
    '.......kk.......', '......kggk......', '..kkkkkggkkkkk..', '.kwwwwwggwwwwdk.',
    '.kwwwwwwwwwwwdk.', '.kwwblbwwblbwdk.', '.kwwbbbwwbbbwdk.', '.kwwwwwwwwwwwdk.',
    '.kdwwwwwwwwwddk.', '..kdwwwwwwwddk..', '..kdwwwwwwwddk..', '...kdwwwwwddk...',
    '....kdwwwddk....', '.....kdwddk.....', '......kddk......', '.......kk.......'])

# --- 角色與寵物（道具圖示 16×16） ---
build('char_001', {'k': K, 's': '#E8C49C', 'r': '#B4562E', 'd': '#7A3820', 'w': '#B48A5A', 'g': '#8B84A3'}, [
    '................', '.....kkkkk......', '....kgggggk.....', '....ksssssk.....',
    '....kskskskk....', '....kssssskwk...', '.....ksssk.kwk..', '....kkrrrkk.kwk.',
    '...krrrrrrrkkwk.', '..krrkrrrkrrkwk.', '..krrkrrrkrrkwk.', '..kddkrrrkddkwk.',
    '.....krrrk...kk.', '.....kdkdk......', '.....kdkdk......', '....kkk.kkk.....'])
build('pet_001', {'k': K, 'g': '#4BD96A', 'd': '#2A8A42', 's': '#8B94A8', 'l': '#C4CCDB'}, [
    '................', '................', '................', '.....kkkkkk.....',
    '....kslslsdk....', '...kslslslsdk...', '...klslslsldk...', '...kslslslsdk...',
    '..kkdssssssdkk..', '.kggkkkkkkkkggk.', '.kgggggggggggdk.', '..kdgkddkdkgdk..',
    '...kk.kk.kk.kk..', '................', '................', '................'])

# =====================================================================
# 戰鬥立繪 32×32（顯示 128px CSS）
# =====================================================================

build('battle_char_001', {'k': K, 's': '#E8C49C', 'r': '#B4562E', 'd': '#7A3820',
                          'w': '#B48A5A', 'g': '#8B84A3', 'e': '#0B0A12', 'l': '#FFDCB8'}, [
    '................................',
    '................................',
    '...........kkkkkkkk.............',
    '..........kggggggggk............',
    '.........kggggggggggk...........',
    '.........kggggggggggk...........',
    '..........kssssssssk............',
    '.........ksslssssslsk...........',
    '.........kssessssessk...........',
    '.........kssssssssssk...........',
    '.........kssskkkksssk...........',
    '..........kssssssssk......kk....',
    '...........kssssssk......kwwk...',
    '..........kkkkkkkkkk.....kwwk...',
    '........kkrrrrrrrrrrkk...kwwk...',
    '.......krrrrrrrrrrrrrrk..kwwk...',
    '......krrkrrrrrrrrkrrrk..kwwk...',
    '.....krrkkrrrrrrrrkkrrk..kwwk...',
    '.....krrk.krrrrrrk.krrkkkkwwk...',
    '.....krrk.krrrrrrk.krrkskkwwk...',
    '.....kddk.krrrrrrk.kddkkskwwk...',
    '......kk..krrrrrrk..kk..kkwwk...',
    '..........krrrrrrk.......kwwk...',
    '..........krrkkrrk.......kwwk...',
    '..........krrk.krrk......kddk...',
    '..........kddk.kddk.......kk....',
    '..........kddk.kddk.............',
    '.........kkddk.kddkk............',
    '........kddddk.kddddk...........',
    '........kkkkk...kkkkk...........',
    '................................',
    '................................'])

build('battle_basic', {'k': K, 'g': '#4BD96A', 'd': '#2A8A42', 'l': '#A8F0B8', 'e': K, 'w': W}, [
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '..........kkkkkkkkkk............',
    '........kkgggggggggkk...........',
    '.......kggglllgggggggk..........',
    '......kggllgggggggggggk.........',
    '.....kgglggggggggggggggk........',
    '.....kglgggggggggggggggk........',
    '....kglgggggggggggggggggk.......',
    '....kggggkkgggggkkgggggk........',
    '...kgggggkekggggkekggggggk......',
    '...kgggggkkgggggkkggggggdk......',
    '...kggggggggggggggggggggdk......',
    '..kggggggggggggggggggggggdk.....',
    '..kggggggkgggggggkgggggggdk.....',
    '..kggggggkkkkkkkkkggggggddk.....',
    '..kggggggggggggggggggggdddk.....',
    '..kgggggggggggggggggggddddk.....',
    '..kdgggggggggggggggggdddddk.....',
    '...kdggggggggggggggddddddk......',
    '...kddddddddddddddddddddk.......',
    '....kkkkkkkkkkkkkkkkkkkk........',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '................................'])

build('battle_armored', {'k': K, 's': '#8B94A8', 'd': '#5A6478', 'l': '#C4CCDB', 'r': '#E8455F'}, [
    '................................',
    '................................',
    '..........kkkkkkkkkkk...........',
    '.........klsssssssssdk..........',
    '........klsssssssssssdk.........',
    '.......klsslsssssssssddk........',
    '.......kssklkssssskdssdk........',
    '.......ksslssssssssdssdk........',
    '......kssssssssssssssssdk.......',
    '......kssskkssssssskksssk.......',
    '......ksskrrkssssskrrkssk.......',
    '......ksskrrkssssskrrkssk.......',
    '......kssskkssssssskkssdk.......',
    '......kssssssssssssssssdk.......',
    '.......kssssskkkkksssssdk.......',
    '.......kssssksssssksssdk........',
    '....kkksssssssssssssssskkk......',
    '...kskkssssssssssssssskksdk.....',
    '..kssk.ksssssssssssssk.kssk.....',
    '..kssk.kssdssssssdssk..kssk.....',
    '..kddk..kssdssssdssk...kddk.....',
    '...kk...kkssssssssk.....kk......',
    '.........kssskssssk.............',
    '.........kssskkssdk.............',
    '.........kssk.kssdk.............',
    '.........kddk.kdddk.............',
    '........kkddk.kdddkk............',
    '.......kdddk...kdddddk..........',
    '.......kkkk.....kkkkk...........',
    '................................',
    '................................',
    '................................'])

build('battle_swift', {'k': K, 'g': '#8B84A3', 'd': '#5A5468', 'l': '#C4BCDB', 'w': W, 'r': '#E8455F'}, [
    '................................',
    '................................',
    '................................',
    '....kk..................kk......',
    '...kgdk................kgdk.....',
    '...kggdk..............kggdk.....',
    '...kgggdkkkkkkkkkkkkkkgggdk.....',
    '...kggggggggggggggggggggggk.....',
    '....kglgggggggggggggggggdk......',
    '....kgglggggggggggggggggdk......',
    '.....kggggkkgggggggkkgggk.......',
    '.....kgggkwrkgggggkwrkggk.......',
    '.....kgggkkkkgggggkkkkggk.......',
    '....kggggggggggggggggggggk......',
    '....kgggggggggkkkkkggggggdk.....',
    '...kggggggggggkwwwkkggggggdk....',
    '...kgggggggggggkkkgggggggggk....',
    '..kglgggggkgggggggggkggggggdk...',
    '..kglggggkkgggggggggkkgggggdk...',
    '..kggggggkgggggggggggkgggggdk...',
    '..kgggggggggggggggggggggggddk...',
    '...kglgggggggggggggggggggddk....',
    '...kggggggggggggggggggggdddk....',
    '....kggggggkkkkkkkkkggggddk.....',
    '....kggggggk.......kggggdk......',
    '.....kggggdk.......kggggdk......',
    '.....kggddk.........kggddk......',
    '.....kgdk.............kgdk......',
    '....kkdk...............kddk.....',
    '....kkk.................kkk.....',
    '................................',
    '................................'])

print('sprites written to', OUT)
