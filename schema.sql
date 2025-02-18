DROP TABLE IF EXISTS projects;
CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    twitterUsername TEXT NOT NULL,
    projectName TEXT NOT NULL,
    description TEXT NOT NULL,
    projectPicture TEXT,
    websiteLink TEXT NOT NULL,
    communityLink TEXT NOT NULL,
    xLink TEXT NOT NULL,
    chain TEXT NOT NULL,
    sector TEXT NOT NULL,
    tgeDate TEXT NOT NULL,
    fdv TEXT NOT NULL,
    ticker TEXT NOT NULL,
    tokenPicture TEXT,
    dataRoom TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index pour accélérer les recherches par userId
CREATE INDEX idx_projects_userId ON projects(userId); 