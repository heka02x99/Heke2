# Heke2 Oyunları

## Hücre Savaşı — Otomatik büyüyen hücreler (`buyume/`)

Hücreleri yiyerek büyüdüğün, tarayıcıda çalışan bir hücre oyunu. Farkı: **oyuna girdiğin anda hücren kendiliğinden büyümeye başlar** (parça başına +2.5 kütle/sn). Bölündüğünde her parça ayrı ayrı büyür, bu yüzden bölünmek hem saldırı hem büyüme taktiği olur. 500 kütlenin üstünde parçalar yavaşça erir, böylece büyüme sonsuza kadar sürmez. Kurallar botlar için de aynıdır.

`buyume/index.html` dosyasını tarayıcıda aç, adını yaz ve **OYNA**'ya bas.

| Kontrol | İşlev |
| --- | --- |
| Fare / dokunma | Yön |
| Space / BÖL | Bölünme (36+ kütle, en fazla 16 parça) |
| W / AT | Kütle atma (basılı tutulabilir) |
| P / Esc | Duraklatma |

- Senden en az %25 küçük hücreleri yiyebilirsin; büyükler de seni yer.
- Mor dikenli mayınlar: küçükken arkasına saklanabilirsin, büyükken çarparsan parçalara ayrılırsın.
- 24 bot: büyüklerden kaçar, küçükleri kovalar, fırsat bulunca bölünüp saldırır.
- Liderlik tablosu, mini harita, telefon için dokunmatik düğmeler.

---

# Kritik Bölge — Tarayıcıda Taktik FPS

CS2 tarzı, tarayıcıda çalışan 5v5 taktik nişancı oyunu. Three.js ile yazıldı; kurulum veya derleme gerekmez.

## Nasıl oynanır?

`index.html` dosyasını tarayıcıda (Chrome, Edge, Firefox) açman yeterli. İstersen yerel sunucuyla da çalıştırabilirsin:

```bash
python3 -m http.server 8000
# sonra http://localhost:8000 adresini aç
```

Takımını (Saldırı / Savunma) ve bot zorluğunu seç, **OYNA**'ya bas ve ekrana tıkla.

## Kurallar

- Bir tarafta 5 kişi var: sen ve 4 bot takım arkadaşı, karşında 5 bot. İlk **8 turu** alan maçı kazanır.
- **Saldırı (T):** C4'ü A veya B bölgesine kur (E tuşunu basılı tut) ve 40 saniye boyunca koru, ya da tüm savunmayı yok et.
- **Savunma (CT):** Bölgeleri savun. Bomba kurulursa yanına git ve E ile imha et (5 sn). Süre dolarsa savunma kazanır.
- **Ekonomi:** Tur kazanırsan $3250, kaybedersen $1400 alırsın (art arda kayıplarda artar). Silaha göre öldürme ödülü de var. Tur başında ve tur başladıktan sonraki ilk 20 saniyede doğuş alanında **B** ile satın alma yapabilirsin.

## Kontroller

| Tuş | İşlev |
| --- | --- |
| WASD | Hareket |
| Fare | Nişan alma |
| Sol tık / Sağ tık | Ateş / Dürbün (keskin nişancı tüfeği) |
| Space | Zıplama |
| Ctrl veya C | Çömelme (daha isabetli atış) |
| Shift | Yürüme (sessiz, düşmanlar duymaz) |
| R | Şarjör değiştirme |
| 1-5, Q | Silah seçme, son silaha dönme |
| G | El bombası (HE) atma |
| B | Satın alma menüsü |
| E | Bomba kurma / imha etme |
| Tab | Skor tablosu |
| Esc | Duraklatma |

## Özellikler

- 7 silah: tabancalar, hafif makineli, pompalı, iki tüfek ve dürbünlü keskin nişancı tüfeği. Her birinin kendi hasar, atış hızı ve sekme (sprey) deseni var.
- Kafadan vuruş çarpanı, zırh ve kask, mesafeyle düşen hasar.
- Hareket halinde, havadayken ve çömelirken farklı isabet. Durup ateş etmek ödüllendirilir.
- Botlar: görüş açısı ve duvar arkası kontrolü, ses duyma (koşma, ateş), tepki süresi, sprey kontrolü, bomba kurma, imha etme, bombayı yerden alma ve tur başında alışveriş.
- İki bölgeli (A/B), üç koridorlu harita; radar, öldürme akışı, ölünce takım arkadaşını izleme.
- Tüm sesler WebAudio ile anında üretilir, harici dosya gerekmez.

## Dosya yapısı

```
index.html        Arayüz ve menüler
style.css         HUD ve menü stilleri
js/audio.js       Prosedürel ses efektleri
js/map.js         Harita geometrisi, çarpışma, ışın testleri, navigasyon ağı
js/weapons.js     Silah verileri, sprey deseni, silah modelleri
js/entities.js    Oyuncu/bot varlıkları, atış, hasar, efektler, el bombası
js/bots.js        Bot yapay zekâsı
js/hud.js         Radar, skor tablosu, satın alma menüsü
js/game.js        Oyun döngüsü, tur yönetimi, C4, oyuncu kontrolü
vendor/three.min.js  Three.js r158 (MIT lisansı)
```
