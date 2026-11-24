/**
 * QueueLess AI: Multilingual Internationalization (EN / HI)
 */

const translations = {
  en: {
    nav_home: 'Home',
    nav_orgs: 'Organizations',
    nav_public: 'Live TV Display',
    nav_login: 'Login',
    nav_signup: 'Sign Up',
    hero_title: 'Smart AI-Powered Queue Management Platform',
    hero_subtitle: 'Eliminate physical lines across hospitals, banks, colleges, and government offices. Join queues remotely, monitor live wait positions, and arrive just in time.',
    btn_get_token: 'Get Digital Token',
    btn_explore_orgs: 'Explore Organizations',
    how_it_works: 'How QueueLess AI Works',
    step1_title: '1. Select Organization',
    step1_desc: 'Browse verified hospitals, banks, and public centers near you.',
    step2_title: '2. Generate Digital Token',
    step2_desc: 'Get an instant QR-code verified queue token from your smartphone or kiosk.',
    step3_title: '3. Track Live Position',
    step3_desc: 'Watch your position change in real-time with rule-based wait time estimation.',
    step4_title: '4. Direct Counter Access',
    step4_desc: 'Receive an instant alert when it is your turn. Walk in and get served without delays.',
    active_tokens: 'Active Tokens',
    my_appointments: 'My Appointments',
    generate_token: 'Generate Token',
    book_appointment: 'Book Appointment',
    now_serving: 'Now Serving',
    people_ahead: 'People Ahead',
    est_wait_time: 'Estimated Wait',
    cancel_token: 'Cancel Token',
    status_waiting: 'Waiting',
    status_called: 'Called',
    status_serving: 'Serving',
    status_completed: 'Completed',
    status_cancelled: 'Cancelled',
    ask_ai_title: 'QueueLess AI Assistant',
    ai_placeholder: 'Ask about queue status, wait times, or service selection...'
  },
  hi: {
    nav_home: 'होम',
    nav_orgs: 'संस्थान (Organizations)',
    nav_public: 'लाइव टीवी डिस्प्ले',
    nav_login: 'लॉग इन',
    nav_signup: 'साइन अप',
    hero_title: 'स्मार्ट एआई-संचालित कतार प्रबंधन प्रणाली',
    hero_subtitle: 'अस्पतालों, बैंकों, कॉलेजों और सरकारी कार्यालयों में लंबी कतारों को अलविदा कहें। दूर बैठे डिजिटल टोकन लें, लाइव कतार स्थिति देखें और सही समय पर पहुँचें।',
    btn_get_token: 'डिजिटल टोकन प्राप्त करें',
    btn_explore_orgs: 'संस्थान देखें',
    how_it_works: 'QueueLess AI कैसे काम करता है',
    step1_title: '१. संस्थान और शाखा चुनें',
    step1_desc: 'अपने आस-पास के सत्यापित अस्पतालों, बैंकों और सेवा केंद्रों को खोजें।',
    step2_title: '२. डिजिटल टोकन बनाएं',
    step2_desc: 'अपने स्मार्टफोन से तुरंत क्यूआर-सत्यापित डिजिटल टोकन प्राप्त करें।',
    step3_title: '३. लाइव कतार स्थिति देखें',
    step3_desc: 'सटीक प्रतीक्षा समय और वास्तविक समय स्थिति अपडेट प्राप्त करें।',
    step4_title: '४. काउंटर पर सीधा प्रवेश',
    step4_desc: 'अपनी बारी आने पर तुरंत सूचना पाएं और बिना प्रतीक्षा किए सेवा प्राप्त करें।',
    active_tokens: 'सक्रिय टोकन',
    my_appointments: 'मेरे अपॉइंटमेंट्स',
    generate_token: 'टोकन बनाएं',
    book_appointment: 'अपॉइंटमेंट बुक करें',
    now_serving: 'वर्तमान में सेवारत',
    people_ahead: 'आपके आगे लोग',
    est_wait_time: 'अनुमानित प्रतीक्षा समय',
    cancel_token: 'टोकन रद्द करें',
    status_waiting: 'प्रतीक्षारत',
    status_called: 'बुलाया गया',
    status_serving: 'सेवा जारी है',
    status_completed: 'पूर्ण',
    status_cancelled: 'रद्द किया गया',
    ask_ai_title: 'QueueLess AI सहायक',
    ai_placeholder: 'कतार स्थिति, प्रतीक्षा समय या सेवा के बारे में पूछें...'
  }
};

const getLanguage = () => localStorage.getItem('queueless_lang') || 'en';

const setLanguage = (lang) => {
  localStorage.setItem('queueless_lang', lang);
  applyTranslations();
  updateLangButton();
};

const applyTranslations = () => {
  const currentLang = getLanguage();
  const dict = translations[currentLang] || translations.en;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) {
      if (el.tagName === 'INPUT' && el.getAttribute('placeholder')) {
        el.setAttribute('placeholder', dict[key]);
      } else {
        el.textContent = dict[key];
      }
    }
  });
};

const toggleLanguage = () => {
  const current = getLanguage();
  setLanguage(current === 'en' ? 'hi' : 'en');
};

const updateLangButton = () => {
  const current = getLanguage();
  document.querySelectorAll('.lang-btn-text').forEach(el => {
    el.textContent = current === 'en' ? 'हिन्दी' : 'English';
  });
};

window.I18N = {
  getLanguage,
  setLanguage,
  toggleLanguage,
  applyTranslations
};

document.addEventListener('DOMContentLoaded', () => {
  applyTranslations();
  updateLangButton();
});
