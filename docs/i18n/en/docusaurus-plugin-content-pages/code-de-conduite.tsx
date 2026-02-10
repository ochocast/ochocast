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

export default function CodeDeConduite(): JSX.Element {
  return (
    <Layout
      title="Code of Conduct"
      description="OchoCast project code of conduct">
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.content}>
            <h1 className={styles.title}>Code of Conduct</h1>
          
          <p className={styles.intro}>
            The OchoCast project is committed to providing a welcoming and respectful environment for all 
            contributors, users, and community members.
          </p>

          <section className={styles.section} id="nos-engagements">
            <h2 className={styles.sectionTitle}>Our Pledge</h2>
            <p className={styles.text}>
              In the interest of fostering an open and welcoming environment, we pledge to make participation in 
              our project and our community a harassment-free experience for everyone, regardless of age, body 
              size, disability, ethnicity, gender identity and expression, level of experience, nationality, 
              personal appearance, race, religion, or sexual identity and orientation.
            </p>
          </section>

          <section className={styles.section} id="nos-standards">
            <h2 className={styles.sectionTitle}>Our Standards</h2>
            <p className={styles.text}>
              Examples of behavior that contributes to creating a positive environment include:
            </p>
            <ul className={styles.list}>
              <li>Using welcoming and inclusive language</li>
              <li>Being respectful of differing viewpoints and experiences</li>
              <li>Gracefully accepting constructive criticism</li>
              <li>Focusing on what is best for the community</li>
              <li>Showing empathy towards other community members</li>
            </ul>
          </section>

          <section className={styles.section} id="comportements-inacceptables">
            <h2 className={styles.sectionTitle}>Unacceptable Behavior</h2>
            <p className={styles.text}>
              Examples of unacceptable behavior include:
            </p>
            <ul className={styles.list}>
              <li>The use of sexualized language or imagery and unwelcome sexual attention or advances</li>
              <li>Trolling, insulting or derogatory comments, and personal or political attacks</li>
              <li>Public or private harassment</li>
              <li>Publishing others' private information without explicit permission</li>
              <li>Other conduct which could reasonably be considered inappropriate in a professional setting</li>
            </ul>
          </section>

          <section className={styles.section} id="nos-responsabilites">
            <h2 className={styles.sectionTitle}>Our Responsibilities</h2>
            <p className={styles.text}>
              Project maintainers are responsible for clarifying the standards of acceptable behavior and are 
              expected to take appropriate and fair corrective action in response to any instances of unacceptable 
              behavior.
            </p>
          </section>

          <section className={styles.section} id="application">
            <h2 className={styles.sectionTitle}>Enforcement</h2>
            <p className={styles.text}>
              Instances of abusive, harassing, or otherwise unacceptable behavior may be reported by contacting 
              the project team. All complaints will be reviewed and investigated and will result in a response 
              that is deemed necessary and appropriate to the circumstances.
            </p>
          </section>
          </div>
          
          <aside className={styles.toc}>
            <h3 className={styles.tocTitle}>On this page</h3>
            <ul className={styles.tocList}>
              <li><a href="#nos-engagements">Our Pledge</a></li>
              <li><a href="#nos-standards">Our Standards</a></li>
              <li><a href="#comportements-inacceptables">Unacceptable Behavior</a></li>
              <li><a href="#nos-responsabilites">Our Responsibilities</a></li>
              <li><a href="#application">Enforcement</a></li>
            </ul>
          </aside>
        </div>
      </main>
      <Footer />
    </Layout>
  );
}
