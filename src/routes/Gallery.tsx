import { Link } from 'react-router-dom';
import { visibleProjects, type Project } from '../projects';
import '../styles/gallery.css';

/**
 * Static sketches are separate documents in public/, so they need a real
 * navigation — a <Link> would try to match them against the router and 404.
 */
function ProjectRow({ project }: { project: Project }) {
  const inner = (
    <>
      <div className="project-left">
        <span className="project-index">{project.index}</span>
        <span className="project-name">{project.name}</span>
      </div>
      <div className="project-right">
        <span className="project-date">{project.date}</span>
        <span className="project-arrow">→</span>
      </div>
    </>
  );

  return (
    <li className="project">
      {project.kind === 'route' ? (
        <Link to={project.href}>{inner}</Link>
      ) : (
        <a href={project.href}>{inner}</a>
      )}
    </li>
  );
}

export default function Gallery() {
  return (
    <div className="gallery">
      <main>
        <p className="section-label">my design explorations</p>
        <ul className="projects">
          {visibleProjects.map((project) => (
            <ProjectRow key={project.href} project={project} />
          ))}
        </ul>
      </main>
    </div>
  );
}
