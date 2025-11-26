import React from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './code-de-conduite.module.css';
import footerStyles from './index.module.css';

function Footer() {
  return (
    <footer className={footerStyles.footer}>
      <div className={footerStyles.footerContainer}>
        <div className={footerStyles.footerColumn}>
          <h3 className={footerStyles.footerTitle}>OchoCast</h3>
          <p className={footerStyles.footerDescription}>
            La solution libre pour capturer et diffuser vos savoirs. Un projet open source développé avec passion par des élèves.
          </p>
          <h4 className={footerStyles.footerSubtitle}>Contribuer</h4>
          <a href="https://github.com/ochocast/ochocast-webapp" className={footerStyles.footerLink}>
            <svg className={footerStyles.githubIcon} viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            Voir sur GitHub
          </a>
        </div>
        <div className={footerStyles.footerColumn}>
          <h3 className={footerStyles.footerTitle}>Liens rapides</h3>
          <ul className={footerStyles.footerList}>
            <li><Link to="/" className={footerStyles.footerLink}>Accueil</Link></li>
            <li><Link to="/code-de-conduite" className={footerStyles.footerLink}>Code de conduite</Link></li>
            <li><Link to="/origine-du-projet" className={footerStyles.footerLink}>Histoire du projet</Link></li>
            <li><Link to="/equipes" className={footerStyles.footerLink}>Équipe</Link></li>
            <li><Link to="/remerciements" className={footerStyles.footerLink}>Remerciements</Link></li>
          </ul>
        </div>
        <div className={footerStyles.footerColumn}>
          <h3 className={footerStyles.footerTitle}>Ressources</h3>
          <ul className={footerStyles.footerList}>
            <li><Link to="/docs/documentation/utilisation/introduction" className={footerStyles.footerLink}>Documentation</Link></li>
            <li><Link to="/versions" className={footerStyles.footerLink}>Versions</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

export default function OrigineDuProjet(): JSX.Element {
  return (
    <Layout
      title="Origine du projet"
      description="Histoire et origine du projet OchoCast">
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.content}>
            <h1 className={styles.title}>Origine du projet</h1>
          
            <p className={styles.text}>
              Le projet Ochocast est né il y a trois ans, dans le cadre d'un projet pédagogique de la filière SIGL 
              (Systèmes d'Information et Génie Logiciel) à l'EPITA. Il a vu le jour à l'initiative de Swann Brunet, qui 
              a formulé le besoin d'une solution ouverte et collaborative de diffusion vidéo.
            </p>

            <p className={styles.text}>
              Dès le départ, le projet s'est inscrit dans le format du PAE (Projet d'Approfondissement et 
              d'Expérimentation), un dispositif qui confronte les étudiants à de véritables problématiques 
              d'entreprise. L'objectif : développer des solutions concrètes, tout en expérimentant des méthodes 
              et technologies modernes.
            </p>

            <p className={styles.text}>
              Chaque année, une nouvelle équipe d'étudiants reprend l'existant, l'analyse, puis l'améliore. Cette 
              transmission d'une promotion à l'autre permet au projet de s'enrichir progressivement, d'évoluer 
              avec les retours des encadrants et des professionnels impliqués, et de renforcer sa dimension 
              communautaire.
            </p>

            <p className={styles.text}>
              Aujourd'hui, Ochocast est bien plus qu'un simple exercice académique : c'est une application open 
              source vivante, façonnée par plusieurs générations d'étudiants et portée par une vision commune : 
              rendre la captation et la diffusion vidéo accessibles à tous, sans dépendance à des solutions 
              propriétaires.
            </p>
          </div>
          
          <aside className={styles.toc}>
            <h3 className={styles.tocTitle}>Sur cette page</h3>
            <ul className={styles.tocList}>
              <li><a href="#top">Origine du projet</a></li>
            </ul>
          </aside>
        </div>
      </main>
      <Footer />
    </Layout>
  );
}
