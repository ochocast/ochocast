import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import styles from '@site/src/pages/index.module.css';

function HomepageHeader() {
  return (
    <header className={styles.heroBanner}>
      <div className={styles.heroContainer}>
        <div className={styles.logoContainer}>
          <img src="img/logo.svg" alt="OchoCast Logo" className={styles.heroLogo} />
          <h1 className={styles.heroTitle}>
            OCHO<span className={styles.titleBold}>CAST</span>
          </h1>
        </div>
        <p className={styles.heroSubtitle}>
          The free solution to capture and broadcast your knowledge
        </p>
        <div className={styles.heroButtons}>
          <Link className={styles.buttonDemo} to="https://demo.ochocast.fr">
            Demo
          </Link>
          <Link className={styles.buttonDocs} to="/docs/documentation/utilisation/introduction">
            Documentation
          </Link>
        </div>
        <p className={styles.versionInfo}>
          Version <span className={styles.versionNumber}>3.0.0</span> • Latest release: October 10, 2025
        </p>
      </div>
    </header>
  );
}

function ProductSection() {
  return (
    <section className={styles.productSection}>
      <div className={styles.container}>
        <h2 className={styles.sectionTitle}>The Product</h2>
        <p className={styles.productDescription}>
          <strong>Ochocast</strong> is a multi-channel streaming application designed for your events, whether live or on-demand. It offers a complete platform to manage, broadcast, and archive your video content with ease.
        </p>
        <div className={styles.productImages}>
          <div className={styles.productImage}>
            <img src="img/product-screenshot-1.svg" alt="OchoCast Interface" />
          </div>
          <div className={styles.productImage}>
            <img src="img/product-screenshot-2.svg" alt="OchoCast Video Player" />
          </div>
        </div>
        <p className={styles.productFooter}>
        Designed as a free and open alternative, it facilitates the management and distribution of video content in a collaborative and scalable environment. OchoCast adapts to your needs, whether you're organizing conferences, training sessions, or webinars.
        </p>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const features = [
    {
      title: 'Video Storage',
      description: 'Host, organize, and broadcast your recorded content. Maintain a complete library of your past events accessible at any time.'
    },
    {
      title: 'Live Streaming',
      description: "Broadcast your events in real-time with minimal latency. Share your content instantly with your audience wherever they are."
    },
    {
      title: 'Open Source',
      description: 'Transparency, freedom, and community contributions. The source code is open, auditable, and modifiable according to your specific needs.'
    },
    {
      title: 'White Label',
      description: "Designed to adapt to your needs and use cases. Customize the interface to reflect your visual identity and brand."
    }
  ];

  return (
    <section className={styles.featuresSection}>
      <div className={styles.container}>
        <h2 className={styles.sectionTitle}>Key Features</h2>
        <div className={styles.featuresGrid}>
          {features.map((feature, idx) => (
            <div key={idx} className={styles.featureCard}>
              <h3 className={styles.featureTitle}>{feature.title}</h3>
              <p className={styles.featureDescription}>{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerContainer}>
        <div className={styles.footerColumn}>
          <h3 className={styles.footerTitle}>OchoCast</h3>
          <p className={styles.footerDescription}>
          The free solution to capture and broadcast your knowledge. An open source project developed with passion by students.
          </p>
          <h4 className={styles.footerSubtitle}>Contribute</h4>
          <a href="https://github.com/ochocast/ochocast-webapp" className={styles.footerLink}>
            <svg className={styles.githubIcon} viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            View on GitHub
          </a>
        </div>
        <div className={styles.footerColumn}>
          <h3 className={styles.footerTitle}>Quick Links</h3>
          <ul className={styles.footerList}>
            <li><Link to="/" className={styles.footerLink}>Home</Link></li>
            <li><Link to="/code-de-conduite" className={styles.footerLink}>Code of Conduct</Link></li>
            <li><Link to="/origine-du-projet" className={styles.footerLink}>Project History</Link></li>
            <li><Link to="/equipes" className={styles.footerLink}>Team</Link></li>
            <li><Link to="/remerciements" className={styles.footerLink}>Acknowledgments</Link></li>
          </ul>
        </div>
        <div className={styles.footerColumn}>
          <h3 className={styles.footerTitle}>Resources</h3>
          <ul className={styles.footerList}>
            <li><Link to="/docs/documentation/utilisation/introduction" className={styles.footerLink}>Documentation</Link></li>
            <li><Link to="/versions" className={styles.footerLink}>Versions</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title="Home"
      description="The free solution to capture and broadcast your knowledge">
      <HomepageHeader />
      <ProductSection />
      <FeaturesSection />
      <Footer />
    </Layout>
  );
}
