function googleTranslateElementInit() {
  new google.translate.TranslateElement(
    { 
      pageLanguage: 'fr', 
      autoDisplay: false, 
      layout: google.translate.TranslateElement.InlineLayout.SIMPLE,
      multilanguagePage: true 
    },
    'google_translate_element'
  );
}
