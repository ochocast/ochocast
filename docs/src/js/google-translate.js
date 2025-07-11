function googleTranslateElementInit() {
    new google.translate.TranslateElement(
        {
            pageLanguage: 'fr',
            autoDisplay: false,
            layout: google.translate.TranslateElement.InlineLayout.SIMPLE,
            // This tells the widget to translate the entire page
            multilanguagePage: true
        },
        'google_translate_element'
    );
}
