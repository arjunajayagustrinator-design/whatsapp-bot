// Kuis pilihan ganda. Di grup semua orang boleh jawab, poin untuk yang
// pertama benar; di chat pribadi jadi kuis solo 10 soal.
const { shuffle } = require('./util');

const LETTERS = ['A', 'B', 'C', 'D'];

const BANK = [
  { q: 'Ibu kota Provinsi Sulawesi Selatan adalah?', o: ['Manado', 'Makassar', 'Kendari', 'Palu'], a: 1, c: 'Geografi' },
  { q: 'Planet terbesar di tata surya adalah?', o: ['Saturnus', 'Bumi', 'Jupiter', 'Neptunus'], a: 2, c: 'Sains' },
  { q: 'Siapa proklamator kemerdekaan Indonesia bersama Soekarno?', o: ['Sutan Sjahrir', 'Mohammad Hatta', 'Tan Malaka', 'Ki Hajar Dewantara'], a: 1, c: 'Sejarah' },
  { q: 'Berapa jumlah pemain inti satu tim sepak bola?', o: ['9', '10', '11', '12'], a: 2, c: 'Olahraga' },
  { q: 'Rumus kimia air adalah?', o: ['CO2', 'H2O', 'O2', 'NaCl'], a: 1, c: 'Sains' },
  { q: 'Alat musik angklung berasal dari daerah?', o: ['Jawa Barat', 'Bali', 'Sumatera Utara', 'Papua'], a: 0, c: 'Budaya' },
  { q: 'Hewan tercepat di darat adalah?', o: ['Kuda', 'Cheetah', 'Rusa', 'Singa'], a: 1, c: 'Sains' },
  { q: 'Mata uang Jepang adalah?', o: ['Won', 'Yuan', 'Yen', 'Baht'], a: 2, c: 'Umum' },
  { q: 'Berapa hasil dari 15 x 12?', o: ['170', '180', '190', '200'], a: 1, c: 'Matematika' },
  { q: 'Danau terbesar di Indonesia adalah?', o: ['Danau Toba', 'Danau Sentani', 'Danau Poso', 'Danau Maninjau'], a: 0, c: 'Geografi' },
  { q: 'Bahasa pemrograman yang dijalankan Node.js adalah?', o: ['Python', 'JavaScript', 'Ruby', 'PHP'], a: 1, c: 'Teknologi' },
  { q: 'Siapa penemu bola lampu pijar praktis?', o: ['Nikola Tesla', 'Thomas Edison', 'Alexander Bell', 'James Watt'], a: 1, c: 'Sejarah' },
  { q: 'Organ tubuh manusia yang memompa darah adalah?', o: ['Paru-paru', 'Hati', 'Jantung', 'Ginjal'], a: 2, c: 'Sains' },
  { q: 'Candi Borobudur terletak di provinsi?', o: ['Jawa Timur', 'Jawa Tengah', 'DI Yogyakarta', 'Jawa Barat'], a: 1, c: 'Geografi' },
  { q: 'Sebutan untuk sepuluh pangkat tiga adalah?', o: ['100', '1.000', '10.000', '30'], a: 1, c: 'Matematika' },
  { q: 'Benua terluas di dunia adalah?', o: ['Afrika', 'Amerika', 'Asia', 'Eropa'], a: 2, c: 'Geografi' },
  { q: 'Lagu "Indonesia Raya" diciptakan oleh?', o: ['Ismail Marzuki', 'W.R. Supratman', 'Kusbini', 'C. Simanjuntak'], a: 1, c: 'Sejarah' },
  { q: 'Satuan internasional untuk gaya adalah?', o: ['Joule', 'Watt', 'Newton', 'Pascal'], a: 2, c: 'Sains' },
  { q: 'HTTP adalah singkatan dari?', o: ['HyperText Transfer Protocol', 'High Transfer Text Protocol', 'HyperText Transmission Path', 'Host Transfer Protocol'], a: 0, c: 'Teknologi' },
  { q: 'Berapa sisi yang dimiliki segi delapan?', o: ['6', '7', '8', '10'], a: 2, c: 'Matematika' },
  { q: 'Hari Kemerdekaan Indonesia diperingati setiap tanggal?', o: ['1 Juni', '17 Agustus', '28 Oktober', '10 November'], a: 1, c: 'Sejarah' },
  { q: 'Gunung tertinggi di dunia adalah?', o: ['K2', 'Everest', 'Kilimanjaro', 'Denali'], a: 1, c: 'Geografi' },
  { q: 'Hewan yang bernapas dengan insang adalah?', o: ['Lumba-lumba', 'Ikan', 'Paus', 'Penyu'], a: 1, c: 'Sains' },
  { q: 'Siapa pelukis "Mona Lisa"?', o: ['Vincent van Gogh', 'Pablo Picasso', 'Leonardo da Vinci', 'Michelangelo'], a: 2, c: 'Budaya' },
  { q: 'Jumlah provinsi di Indonesia per 2024 adalah?', o: ['34', '35', '37', '38'], a: 3, c: 'Umum' },
  { q: 'Bilangan prima terkecil adalah?', o: ['0', '1', '2', '3'], a: 2, c: 'Matematika' },
  { q: 'Tari Kecak berasal dari?', o: ['Bali', 'Lombok', 'Jawa Tengah', 'Sumatera Barat'], a: 0, c: 'Budaya' },
  { q: 'Perangkat yang menyimpan data sementara di komputer adalah?', o: ['SSD', 'RAM', 'GPU', 'HDD'], a: 1, c: 'Teknologi' },
  { q: 'Ka\'bah berada di kota?', o: ['Madinah', 'Mekkah', 'Kairo', 'Istanbul'], a: 1, c: 'Umum' },
  { q: 'Proses tumbuhan membuat makanan disebut?', o: ['Respirasi', 'Fotosintesis', 'Transpirasi', 'Fermentasi'], a: 1, c: 'Sains' },
  { q: 'Piala Dunia FIFA diadakan setiap berapa tahun?', o: ['2 tahun', '3 tahun', '4 tahun', '5 tahun'], a: 2, c: 'Olahraga' },
  { q: 'Selat yang memisahkan Sumatera dan Jawa adalah?', o: ['Selat Sunda', 'Selat Malaka', 'Selat Bali', 'Selat Madura'], a: 0, c: 'Geografi' },
  { q: 'Siapa presiden pertama Republik Indonesia?', o: ['Soeharto', 'Soekarno', 'B.J. Habibie', 'Megawati'], a: 1, c: 'Sejarah' },
  { q: 'Berapa akar kuadrat dari 144?', o: ['11', '12', '13', '14'], a: 1, c: 'Matematika' },
  { q: 'Bagian mata yang mengatur jumlah cahaya masuk adalah?', o: ['Kornea', 'Retina', 'Pupil', 'Lensa'], a: 2, c: 'Sains' },
  { q: 'Aplikasi WhatsApp pertama kali dirilis pada tahun?', o: ['2007', '2009', '2011', '2013'], a: 1, c: 'Teknologi' }
];

const TOTAL = 10;

function question(state) {
  const item = state.questions[state.index];
  const options = item.o.map((opt, i) => `${LETTERS[i]}. ${opt}`).join('\n');
  return [
    `❓ *KUIS* — soal ${state.index + 1}/${state.questions.length}`,
    `📚 Kategori: _${item.c}_`,
    '',
    `*${item.q}*`,
    '',
    options,
    '',
    'Jawab dengan A/B/C/D. Ketik `lewat` untuk melewati soal.'
  ].join('\n');
}

function scoreboard(state) {
  const entries = Object.entries(state.scores).sort((a, b) => b[1].points - a[1].points);
  if (!entries.length) return '_Tidak ada yang menjawab benar._';
  return entries.map(([, value], i) => `${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} ${value.name} — ${value.points} benar`).join('\n');
}

function finish(state) {
  const entries = Object.entries(state.scores).sort((a, b) => b[1].points - a[1].points);
  const awards = entries.map(([waId, value], i) => ({
    waId, name: value.name, points: value.points * 5 + (i === 0 ? 10 : 0), win: i === 0
  }));
  return {
    text: [
      '🏁 *KUIS SELESAI!*',
      `Total ${state.questions.length} soal.`,
      '',
      scoreboard(state),
      '',
      'Main lagi? Ketik `/quiz`'
    ].join('\n'),
    end: true,
    scores: awards
  };
}

module.exports = {
  id: 'quiz',
  name: 'Kuis',
  emoji: '🧠',
  aliases: ['quiz', 'kuis', 'trivia'],
  usage: '/quiz [jumlah soal]',
  desc: 'Kuis pilihan ganda; di grup siapa cepat dia dapat.',

  start(ctx) {
    const requested = Number(ctx.argv[0]);
    const total = Number.isInteger(requested) ? Math.min(Math.max(requested, 3), BANK.length) : TOTAL;
    const state = { questions: shuffle(BANK).slice(0, total), index: 0, scores: {} };
    return {
      text: `🧠 *KUIS DIMULAI* — ${total} soal\n${ctx.isGroup ? 'Semua anggota grup boleh menjawab, poin untuk yang pertama benar.' : 'Jawab sebisamu, tidak ada batas waktu.'}\n\n${question(state)}`,
      state
    };
  },

  input(ctx) {
    const state = ctx.session.state;
    const raw = ctx.body.trim().toLowerCase();
    const item = state.questions[state.index];

    let choice = -1;
    if (/^[abcd]$/.test(raw)) choice = LETTERS.indexOf(raw.toUpperCase());
    else if (/^[1-4]$/.test(raw)) choice = Number(raw) - 1;
    else if (raw === 'lewat' || raw === 'skip') choice = -2;
    else return null;

    let note;
    if (choice === -2) {
      note = `⏭️ Dilewati. Jawaban: *${LETTERS[item.a]}. ${item.o[item.a]}*`;
    } else if (choice === item.a) {
      const entry = state.scores[ctx.sender] || { name: ctx.senderName, points: 0 };
      entry.points += 1;
      entry.name = ctx.senderName;
      state.scores[ctx.sender] = entry;
      note = `✅ *Benar!* ${ctx.senderName} +1 poin (total ${entry.points})`;
    } else {
      // Jawaban salah tidak menghabiskan soal supaya yang lain masih bisa coba.
      return { text: `❌ ${ctx.senderName} salah. Masih terbuka untuk yang lain!` };
    }

    state.index += 1;
    if (state.index >= state.questions.length) {
      const result = finish(state);
      result.text = `${note}\n\n${result.text}`;
      return result;
    }
    return { text: `${note}\n\n${question(state)}` };
  }
};
