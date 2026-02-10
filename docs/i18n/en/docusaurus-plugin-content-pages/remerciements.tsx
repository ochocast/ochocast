import React from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from '@site/src/pages/code-de-conduite.module.css';
import footerStyles from '@site/src/pages/index.module.css';

function Footer() {
  return (
    <footer className={footerStyles.footer}>
      <div className={footerStyles.footerContainer}>
        <div className={footerStyles.footerColumn}>
          <h3 className={footerStyles.footerTitle}>OchoCast</h3>
          <p className={footerStyles.footerDescription}>
            The free solution to capture and broadcast your knowledge. An open source project developed with passion by students.
          </p>
          <h4 className={footerStyles.footerSubtitle}>Contribute</h4>
          <a href="https://github.com/ochocast/ochocast-webapp" className={footerStyles.footerLink}>
            <svg className={footerStyles.githubIcon} viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            View on GitHub
          </a>
        </div>
        <div className={footerStyles.footerColumn}>
          <h3 className={footerStyles.footerTitle}>Quick Links</h3>
          <ul className={footerStyles.footerList}>
            <li><Link to="/" className={footerStyles.footerLink}>Home</Link></li>
            <li><Link to="/code-de-conduite" className={footerStyles.footerLink}>Code of Conduct</Link></li>
            <li><Link to="/origine-du-projet" className={footerStyles.footerLink}>Project History</Link></li>
            <li><Link to="/equipes" className={footerStyles.footerLink}>Team</Link></li>
            <li><Link to="/remerciements" className={footerStyles.footerLink}>Acknowledgments</Link></li>
          </ul>
        </div>
        <div className={footerStyles.footerColumn}>
          <h3 className={footerStyles.footerTitle}>Resources</h3>
          <ul className={footerStyles.footerList}>
            <li><Link to="/docs/documentation/utilisation/introduction" className={footerStyles.footerLink}>Documentation</Link></li>
            <li><Link to="/versions" className={footerStyles.footerLink}>Versions</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

export default function Remerciements(): JSX.Element {
  return (
    <Layout
      title="Acknowledgments"
      description="OchoCast project acknowledgments">
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.content}>
            <h1 className={styles.title}>Acknowledgments</h1>
          
            <p className={styles.intro}>
              OchoCast would not exist without the support and contributions of many people and 
              organizations. We would like to warmly thank:
            </p>

            <section className={styles.section} id="octo-technology">
              <h2 className={styles.sectionTitle}>OCTO Technology</h2>
              <p className={styles.text}>
                A huge thank you to our partner who supports us and believes in our vision.
              </p>
            </section>

            <section className={styles.section} id="communaute">
              <h2 className={styles.sectionTitle}>Community</h2>
              <p className={styles.text}>
                A big thank you to our community, mainly composed of former developers on the 
                project, who provided us with valuable feedback and helped us identify and resolve 
                many bugs. Your patience and enthusiasm have been invaluable.
              </p>
            </section>

            <section className={styles.section} id="mentions-speciales">
              <h2 className={styles.sectionTitle}>Special Mentions</h2>
              <p className={styles.text}>
                Thank you to Swann Brunet and Sham Kazemi-Joestani for their support and help throughout the project. 
                Without them, OchoCast would never have seen the light of day.
              </p>
            </section>

            <section className={styles.section} id="contribuer">
              <p className={styles.text}>
                If you would like to contribute to the project, feel free to check out our GitHub repository and join 
                our community!
              </p>
            </section>
          </div>
          
          <aside className={styles.toc}>
            <h3 className={styles.tocTitle}>On this page</h3>
            <ul className={styles.tocList}>
              <li><a href="#octo-technology">OCTO Technology</a></li>
              <li><a href="#communaute">Community</a></li>
              <li><a href="#mentions-speciales">Special Mentions</a></li>
              <li><a href="#contribuer">Contribute</a></li>
            </ul>
          </aside>
        </div>
      </main>
      <Footer />
    </Layout>
  );
}
