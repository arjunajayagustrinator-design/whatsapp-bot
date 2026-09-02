// Bank kata bahasa Indonesia yang dipakai bersama oleh Hangman, Sambung Kata,
// dan Tebak Kata. Sengaja disimpan sebagai data biasa supaya gampang ditambah.

const HANGMAN_WORDS = [
  { word: 'komputer', hint: 'Alat elektronik pengolah data' },
  { word: 'gunung', hint: 'Dataran yang menjulang tinggi' },
  { word: 'sepeda', hint: 'Kendaraan roda dua tanpa mesin' },
  { word: 'nelayan', hint: 'Profesi pencari ikan di laut' },
  { word: 'jendela', hint: 'Lubang berdaun di dinding rumah' },
  { word: 'kucing', hint: 'Hewan peliharaan yang mengeong' },
  { word: 'pelangi', hint: 'Busur warna setelah hujan' },
  { word: 'kompor', hint: 'Alat masak berapi di dapur' },
  { word: 'harimau', hint: 'Kucing besar belang di hutan' },
  { word: 'perpustakaan', hint: 'Tempat meminjam buku' },
  { word: 'matahari', hint: 'Bintang pusat tata surya' },
  { word: 'gitar', hint: 'Alat musik berdawai enam' },
  { word: 'dokter', hint: 'Profesi yang mengobati pasien' },
  { word: 'jembatan', hint: 'Penghubung dua sisi sungai' },
  { word: 'kulkas', hint: 'Lemari pendingin makanan' },
  { word: 'singa', hint: 'Raja hutan bersurai' },
  { word: 'payung', hint: 'Pelindung dari hujan' },
  { word: 'bandara', hint: 'Tempat pesawat lepas landas' },
  { word: 'kamera', hint: 'Alat pengambil gambar' },
  { word: 'semangka', hint: 'Buah besar berair merah' },
  { word: 'gunting', hint: 'Alat pemotong kertas' },
  { word: 'apotek', hint: 'Tempat membeli obat' },
  { word: 'kereta', hint: 'Transportasi di atas rel' },
  { word: 'gajah', hint: 'Mamalia darat berbelalai' },
  { word: 'lampu', hint: 'Sumber cahaya buatan' },
  { word: 'sekolah', hint: 'Tempat menuntut ilmu' },
  { word: 'kunci', hint: 'Pembuka gembok atau pintu' },
  { word: 'bawang', hint: 'Bumbu dapur berlapis' },
  { word: 'pesawat', hint: 'Kendaraan yang terbang' },
  { word: 'mangga', hint: 'Buah kuning manis berbiji besar' },
  { word: 'sungai', hint: 'Aliran air menuju laut' },
  { word: 'kalender', hint: 'Penanda tanggal dan bulan' },
  { word: 'burung', hint: 'Hewan bersayap dan berbulu' },
  { word: 'mesin', hint: 'Penggerak alat industri' },
  { word: 'gelas', hint: 'Wadah untuk minum' },
  { word: 'petani', hint: 'Profesi penggarap sawah' },
  { word: 'lautan', hint: 'Perairan asin yang luas' },
  { word: 'sandal', hint: 'Alas kaki terbuka' },
  { word: 'kardus', hint: 'Kotak dari kertas tebal' }
];

const SCRAMBLE_WORDS = [
  { word: 'anggrek', hint: 'Bunga hias berkelopak indah' },
  { word: 'seragam', hint: 'Pakaian resmi sekolah' },
  { word: 'wartawan', hint: 'Pencari dan penulis berita' },
  { word: 'kompas', hint: 'Penunjuk arah mata angin' },
  { word: 'lemari', hint: 'Tempat menyimpan pakaian' },
  { word: 'gerobak', hint: 'Kendaraan dorong pedagang' },
  { word: 'kelapa', hint: 'Buah pohon pantai berair' },
  { word: 'bioskop', hint: 'Tempat menonton film' },
  { word: 'pahlawan', hint: 'Tokoh pejuang bangsa' },
  { word: 'terminal', hint: 'Tempat bus berhenti' },
  { word: 'lumbung', hint: 'Tempat menyimpan padi' },
  { word: 'kerajaan', hint: 'Wilayah yang dipimpin raja' },
  { word: 'gempa', hint: 'Getaran permukaan bumi' },
  { word: 'sepatu', hint: 'Alas kaki tertutup' },
  { word: 'nasihat', hint: 'Petuah atau saran baik' },
  { word: 'cangkir', hint: 'Wadah minum bertelinga' },
  { word: 'panggung', hint: 'Tempat pentas seniman' },
  { word: 'hutan', hint: 'Kawasan lebat berpohon' },
  { word: 'rumput', hint: 'Tumbuhan hijau di halaman' },
  { word: 'jerapah', hint: 'Hewan berleher panjang' },
  { word: 'pelabuhan', hint: 'Tempat kapal bersandar' },
  { word: 'majalah', hint: 'Terbitan berkala bergambar' },
  { word: 'bendera', hint: 'Kain lambang negara' },
  { word: 'tabungan', hint: 'Uang yang disimpan' },
  { word: 'lentera', hint: 'Lampu minyak berdinding kaca' },
  { word: 'garuda', hint: 'Burung lambang Indonesia' },
  { word: 'sarapan', hint: 'Makan di pagi hari' },
  { word: 'kabupaten', hint: 'Wilayah administratif di provinsi' },
  { word: 'topeng', hint: 'Penutup wajah dalam tari' }
];

// Kamus bot untuk Sambung Kata. Semua huruf yang lazim muncul sebagai huruf
// akhir kata bahasa Indonesia punya stok jawaban, jadi bot tidak gampang buntu.
const CHAIN_WORDS = [
  'angin', 'apel', 'anggur', 'awan', 'atap', 'akar', 'asap', 'arloji', 'ayam', 'album',
  'batu', 'buku', 'bunga', 'bulan', 'bintang', 'benang', 'burung', 'bantal', 'baju', 'beras',
  'cahaya', 'cermin', 'cangkul', 'cabai', 'celana', 'cuaca', 'cokelat', 'cacing', 'candi', 'canting',
  'daun', 'domba', 'dapur', 'danau', 'debu', 'dinding', 'dompet', 'duku', 'durian', 'dahan',
  'emas', 'ember', 'elang', 'embun', 'engsel', 'esai', 'ekor', 'enzim', 'eceng', 'estafet',
  'foto', 'februari', 'fosil', 'formula', 'fajar', 'filter', 'fabel', 'faktur', 'fondasi', 'furnitur',
  'gula', 'garam', 'gunung', 'gelas', 'gitar', 'garpu', 'gudang', 'guru', 'gerbang', 'ganggang',
  'hutan', 'hujan', 'hidung', 'harimau', 'halaman', 'handuk', 'hotel', 'hektar', 'hiasan', 'huruf',
  'ikan', 'istana', 'ibu', 'intan', 'itik', 'iklan', 'ingatan', 'inti', 'isolasi', 'irisan',
  'jalan', 'jendela', 'jagung', 'jaket', 'jarum', 'jamur', 'jembatan', 'jangkar', 'jurang', 'jeruk',
  'kursi', 'kertas', 'kucing', 'kapal', 'kunci', 'kebun', 'kompor', 'kamera', 'kayu', 'kelapa',
  'lampu', 'laut', 'lemari', 'lilin', 'langit', 'lantai', 'lidah', 'lukisan', 'logam', 'lorong',
  'meja', 'mobil', 'mangga', 'malam', 'mata', 'musim', 'menara', 'monyet', 'mawar', 'martabak',
  'nasi', 'nanas', 'negara', 'naga', 'nelayan', 'nampan', 'nomor', 'napas', 'nilai', 'notasi',
  'ombak', 'obat', 'oven', 'orkestra', 'oli', 'otak', 'obeng', 'operasi', 'ongkos', 'oksigen',
  'pintu', 'pohon', 'padi', 'piring', 'pasir', 'pantai', 'pena', 'payung', 'panci', 'pisang',
  'radio', 'rumah', 'roti', 'rambut', 'rusa', 'raket', 'ranting', 'rakit', 'rantai', 'rumput',
  'sepatu', 'sungai', 'sekolah', 'sapu', 'susu', 'sendok', 'semut', 'sawah', 'singa', 'selimut',
  'tanah', 'topi', 'telur', 'tangga', 'taman', 'tikus', 'tas', 'tali', 'tenda', 'terong',
  'ubi', 'udara', 'ular', 'undangan', 'ukiran', 'unta', 'usaha', 'uang', 'urat', 'ulat',
  'vas', 'vitamin', 'video', 'vokal', 'vila', 'volume', 'variasi', 'vaksin', 'veranda', 'visual',
  'warung', 'wajan', 'waktu', 'wortel', 'wayang', 'wilayah', 'wangi', 'warna', 'wadah', 'walet',
  'yoga', 'yakin', 'yayasan', 'yodium', 'yatim', 'yunior', 'yudisium', 'yuran', 'yel', 'yakult',
  'zaman', 'zebra', 'zat', 'zamrud', 'zona', 'zirkon', 'zodiak', 'ziarah', 'zink', 'zigzag'
];

const CHAIN_BY_LETTER = CHAIN_WORDS.reduce((map, word) => {
  const letter = word[0];
  (map[letter] = map[letter] || []).push(word);
  return map;
}, {});

module.exports = { HANGMAN_WORDS, SCRAMBLE_WORDS, CHAIN_WORDS, CHAIN_BY_LETTER };
