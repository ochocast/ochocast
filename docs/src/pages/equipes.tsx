import React from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './code-de-conduite.module.css';
import customStyles from './equipes.module.css';
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

export default function Equipes(): JSX.Element {
  return (
    <Layout
      title="Les équipes derrière ce projet"
      description="Les équipes qui ont contribué au projet OchoCast">
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.content}>
            <h1 className={styles.title}>Les équipes derrière ce projet</h1>
          
            <p className={styles.intro}>
              Ochocast est porté par deux équipes d'étudiants de la filière SIGL à l'EPITA. Ce projet s'inscrit dans le 
              cadre d'un cours, mais va bien au-delà : il nous permet d'explorer concrètement le développement 
              logiciel collaboratif, de mettre en pratique nos compétences, et de contribuer à l'écosystème open 
              source.
            </p>

            <p className={styles.intro}>
              Nous tenons à remercier tous les contributeurs qui ont participé au développement d'OchoCast. Leur 
              expertise et leur dévouement ont été essentiels à la réussite du projet.
            </p>

            <section className={styles.section} id="equipe-2025-2026">
              <div className={customStyles.yearBlock}>
                <h2 className={customStyles.yearTitle}>2025-2026</h2>
                
                {/* Grille pour les 2 équipes */}
                <div className={customStyles.teamGrid2}>
                  <div className={customStyles.teamColumn}>
                    <h3 className={customStyles.teamSubtitle}>Octo 3.1 - Team Vidéo</h3>
                    <p className={customStyles.teamLabel}>SIGL 2026</p>
                    <ul className={customStyles.memberList}>
                      <li>Gwennan JARNO (PO)</li>
                      <li>Louis MIRALLIE (Tech Lead)</li>
                      <li>Loan BERNABLE</li>
                      <li>Haoyu CHENG</li>
                      <li>Marie GRISSONNANCHE</li>
                      <li>Emilia MESSELATY</li>
                      <li>Marie SHAMOUN</li>
                    </ul>
                  </div>

                  <div className={customStyles.teamColumn}>
                    <h3 className={customStyles.teamSubtitle}>Octo 3.2 - Team Live</h3>
                    <p className={customStyles.teamLabel}>SIGL 2026</p>
                    <ul className={customStyles.memberList}>
                      <li>Titouan GRAGNIC (PO)</li>
                      <li>Yohan CANAC (Tech Lead)</li>
                      <li>Kevin AFONSO</li>
                      <li>Marie BOUET</li>
                      <li>Maïlys JARA</li>
                      <li>Guillaume JOLIVALT</li>
                      <li>Marc MAGE</li>
                    </ul>
                  </div>
                </div>

                {/* Grille pour Coach et Client */}
                <div className={customStyles.teamGrid2} style={{marginTop: '2rem'}}>
                  <div className={customStyles.teamColumn}>
                    <h3 className={customStyles.teamSubtitle}>Coach</h3>
                    <p className={customStyles.teamLabel}>OCTO</p>
                    <ul className={customStyles.memberList}>
                      <li>Swann Brunet</li>
                      <li>Sham Kazemi-Joestani</li>
                      <li>Allan SIOU</li>
                      <li>Marin LEFEBVRE</li>
                      <li>Leo VERNIQUET</li>
                      <li>Gabriel SOUFFLET</li>
                    </ul>
                  </div>

                  <div className={customStyles.teamColumn}>
                    <h3 className={customStyles.teamSubtitle}>Clients</h3>
                    <p className={customStyles.teamLabel}>OCTO</p>
                    <ul className={customStyles.memberList}>
                      <li>Swan Brunet</li>
                      <li>Sham Kazemi-Joestani</li>
                      <li>Allan SIOU</li>
                      <li>Marin LEFEBVRE</li>
                      <li>Leo VERNIQUET</li>
                      <li>Gabriel SOUFFLET</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            <section className={styles.section} id="equipe-2024-2025">
              <div className={customStyles.yearBlock}>
                <h2 className={customStyles.yearTitle}>2024-2025</h2>
                
                <div className={customStyles.teamGrid}>
                  <div className={customStyles.teamColumn}>
                    <h3 className={customStyles.teamSubtitle}>Octo team 2.0</h3>
                    <p className={customStyles.teamLabel}>SIGL 2025</p>
                    <ul className={customStyles.memberList}>
                      <li>Allan SIOU</li>
                      <li>Marin LEFEBVRE</li>
                      <li>Leo VERNIQUET</li>
                      <li>Oriane MARGELISCH</li>
                      <li>Liane DAVID</li>
                      <li>Julien DELBOSC</li>
                      <li>Gabriel SOUFFLET</li>
                    </ul>
                  </div>

                  <div className={customStyles.teamColumn}>
                    <h3 className={customStyles.teamSubtitle}>Coach</h3>
                    <p className={customStyles.teamLabel}>OCTO</p>
                    <ul className={customStyles.memberList}>
                      <li>Swann Brunet</li>
                      <li>Sham Kazemi-Joestani</li>
                    </ul>
                  </div>

                  <div className={customStyles.teamColumn}>
                    <h3 className={customStyles.teamSubtitle}>Clients</h3>
                    <p className={customStyles.teamLabel}>OCTO</p>
                    <ul className={customStyles.memberList}>
                      <li>Aurore LeLièvre</li>
                      <li>Swan Brunet</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            <section className={styles.section} id="equipe-2023-2024">
              <div className={customStyles.yearBlock}>
                <h2 className={customStyles.yearTitle}>2023-2024</h2>
                
                <div className={customStyles.teamGrid}>
                  <div className={customStyles.teamColumn}>
                    <h3 className={customStyles.teamSubtitle}>Octo team</h3>
                    <p className={customStyles.teamLabel}>SIGL 2024</p>
                    <ul className={customStyles.memberList}>
                      <li>Gabriel Lion</li>
                      <li>Thomas Witz</li>
                      <li>Samuel Fouchard</li>
                      <li>Yann Boudry</li>
                      <li>Hadrien Combaz</li>
                    </ul>
                  </div>

                  <div className={customStyles.teamColumn}>
                    <h3 className={customStyles.teamSubtitle}>Coach</h3>
                    <p className={customStyles.teamLabel}>OCTO</p>
                    <ul className={customStyles.memberList}>
                      <li>Swann Brunet</li>
                      <li>Sham Kazemi-Joestani</li>
                    </ul>
                  </div>

                  <div className={customStyles.teamColumn}>
                    <h3 className={customStyles.teamSubtitle}>Cliente</h3>
                    <p className={customStyles.teamLabel}>OCTO</p>
                    <ul className={customStyles.memberList}>
                      <li>Aurore LeLièvre</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>
          </div>
          
          <aside className={styles.toc}>
            <h3 className={styles.tocTitle}>Sur cette page</h3>
            <ul className={styles.tocList}>
              <li><a href="#equipe-2025-2026">2025-2026</a></li>
              <li><a href="#equipe-2024-2025">2024-2025</a></li>
              <li><a href="#equipe-2023-2024">2023-2024</a></li>
            </ul>
          </aside>
        </div>
      </main>
      <Footer />
    </Layout>
  );
}
