import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import styles from './index.module.css';

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
          La solution libre pour capturer et diffuser vos savoirs
        </p>
        <div className={styles.heroButtons}>
          <Link className={styles.buttonDemo} to="https://demo.ochocast.fr">
            Démonstration
          </Link>
          <Link className={styles.buttonDocs} to="/docs/documentation/utilisation/introduction">
            Documentation
          </Link>
        </div>
        <p className={styles.versionInfo}>
          Version <span className={styles.versionNumber}>3.0.0</span> • Dernière release : 10 octobre 2025
        </p>
      </div>
    </header>
  );
}

function ProductSection() {
  return (
    <section className={styles.productSection}>
      <div className={styles.container}>
        <h2 className={styles.sectionTitle}>Le produit</h2>
        <p className={styles.productDescription}>
          <strong>Ochocast</strong> est une application de streaming multicanal conçue pour vos événements, qu'ils soient en direct ou disponibles en différé. Elle offre une plateforme complète pour gérer, diffuser et archiver vos contenus vidéo en toute simplicité.
        </p>
        <div className={styles.productImages}>
          <div className={styles.productImage}>
            <img src="img/product-screenshot-1.svg" alt="Interface OchoCast" />
          </div>
          <div className={styles.productImage}>
            <img src="img/product-screenshot-2.svg" alt="Lecteur vidéo OchoCast" />
          </div>
        </div>
        <p className={styles.productFooter}>
        Pensée comme une alternative libre et ouverte, elle facilite la gestion et la diffusion de contenus vidéo dans un cadre collaboratif et évolutif. OchoCast s'adapte à vos besoins, que vous organisiez des conférences, des formations ou des webinaires.
        </p>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const features = [
    {
      title: 'Stockage vidéo',
      description: 'Hébergez, organisez et diffusez vos contenus enregistrés. Conservez une bibliothèque complète de vos événements passés accessible à tout moment.'
    },
    {
      title: 'Streaming en direct',
      description: "Diffusez vos événements en temps réel avec une latence minimale. Partagez vos contenus instantanément avec votre audience où qu'elle soit."
    },
    {
      title: 'Open Source',
      description: 'Transparence, liberté et contributions communautaires. Le code source est ouvert, auditable et modifiable selon vos besoins spécifiques.'
    },
    {
      title: 'Marque Blanche',
      description: "Conçu pour s'adapter à vos besoins et vos cas d'usage. Personnalisez l'interface pour refléter votre identité visuelle et votre marque."
    }
  ];

  return (
    <section className={styles.featuresSection}>
      <div className={styles.container}>
        <h2 className={styles.sectionTitle}>Les features importantes</h2>
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
          La solution libre pour capturer et diffuser vos savoirs. Un projet open source développé avec passion par des élèves.
          </p>
          <h4 className={styles.footerSubtitle}>Contribuer</h4>
          <a href="https://github.com/ochocast/ochocast-webapp" className={styles.footerLink}>
            <svg className={styles.githubIcon} viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            Voir sur GitHub
          </a>
        </div>
        <div className={styles.footerColumn}>
          <h3 className={styles.footerTitle}>Liens rapides</h3>
          <ul className={styles.footerList}>
            <li><Link to="/" className={styles.footerLink}>Accueil</Link></li>
            <li><Link to="/code-de-conduite" className={styles.footerLink}>Code de conduite</Link></li>
            <li><Link to="/origine-du-projet" className={styles.footerLink}>Histoire du projet</Link></li>
            <li><Link to="/equipes" className={styles.footerLink}>Équipe</Link></li>
            <li><Link to="/remerciements" className={styles.footerLink}>Remerciements</Link></li>
          </ul>
        </div>
        <div className={styles.footerColumn}>
          <h3 className={styles.footerTitle}>Ressources</h3>
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
      title="Accueil"
      description="La solution libre pour capturer et diffuser vos savoirs">
      <HomepageHeader />
      <ProductSection />
      <FeaturesSection />
      <Footer />
    </Layout>
  );
}
